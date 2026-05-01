# D1：`site_id` 仍指向备份表 `sites_mig_old_20260629`（外键漂移）

本文记录一次真实故障：**写入 `pages` / `articles` 时出现 `SQLITE_CONSTRAINT` / `FOREIGN KEY constraint failed`**，以及与日期字段、`payload_locked_documents_rels` 一并排查时的要点，避免同类迁移再次发生。

## 成因

在某次站点相关迁移里，SQLite 做过「换表」类操作：真实数据在 **`sites`**，旧数据留在备份表 **`sites_mig_old_20260629`**。若 **`pages`、`articles`、`media`、`workflow_jobs`、`categories`** 等表上的 **`site_id`（或等价列）仍声明为**

```sql
REFERENCES "sites_mig_old_20260629"("id")
```

则库里**只有**备份表里存在的站点 id 才满足 FK；新站点、`sites` 里新增的 id（例如 `sites.id = 9`）在备份表中**不存在**，任何带 `site_id` 的 INSERT/UPDATE 都会报错。

历史上 [`src/migrations/20260708_120000_repair_site_id_fk_to_sites.ts`](../../src/migrations/20260708_120000_repair_site_id_fk_to_sites.ts) 已为 **`categories`** 修了指向；若其它集合当时未一并重建，就会在后续业务（例如「快捷操作 · 生成信任页包」、`prepare` 里 `payload.create({ collection: 'pages', … })`）里暴露。

## 典型现象

- API / 日志：`Failed query: insert into "pages" …`、`D1_ERROR: FOREIGN KEY constraint failed`、`SQLITE_CONSTRAINT`。
- 报错参数里 **`tenant_id`、`site_id` 数值看起来合理**，仍失败——优先怀疑 FK 指向了错误父表。
- Admin **`pages` 列表**曾在另一路径上报 `RangeError: Invalid time value`（日期列存了空串等）；该问题由字段类型/数据清洗另行处理，与 FK 可同时存在。

## 快速自检（本地 / wrangler）

对当前 D1 快照执行：

```bash
sqlite3 "$PATH_TO_DB" "PRAGMA foreign_key_list(pages);"
sqlite3 "$PATH_TO_DB" "PRAGMA foreign_key_list(articles);"
sqlite3 "$PATH_TO_DB" "PRAGMA foreign_key_list(media);"
sqlite3 "$PATH_TO_DB" "SELECT id FROM sites ORDER BY id; SELECT COUNT(*) FROM sites_mig_old_20260629;"
```

若 `site_id` 一行里的 **table** 列为 `sites_mig_old_20260629`，即属外键漂移，应改为指向 **`sites`**。

## 解决办法（已实现）

仓库中的修复迁移：**[`src/migrations/20260712_130000_repair_pages_articles_site_id_fk_to_sites.ts`](../../src/migrations/20260712_130000_repair_pages_articles_site_id_fk_to_sites.ts)**

要点：

1. **`sqlite_master` 读出当前 DDL**，仅在仍包含 `sites_mig_old_20260629` 时执行（幂等）。
2. 新建 **`__new_pages` / `__new_*`**，`site_id` 替换为 **`REFERENCES sites(id)**`，再 `INSERT INTO __new_* SELECT * FROM …`。
3. **Cloudflare D1**：用 **`db.$client.batch([…])`** 在同一批语句里执行 `PRAGMA foreign_keys=OFF`、删旧表、`ALTER … RENAME …`、补索引、`PRAGMA foreign_keys=ON`。逐条 `await db.run()` 容易导致 PRAGMA 不落在一个连接上，不可靠。
4. **`payload_locked_documents_rels`**：`articles_id` / `pages_id` 指向父表主键；在 **`DROP TABLE articles`**（或 `pages`）前**，若仍存在引用，即使 `foreign_keys=OFF` + batch，仍可能在某些环境下受阻。迁移内采用 **读出 → 置 NULL → 重建父表 → 恢复原 id**（行未删，`id` 不变），与安全一致。
5. 迁移注册在 [`src/migrations/index.ts`](../../src/migrations/index.ts)，部署后执行 **`pnpm payload migrate`**。

### `media` 表：`insert into media` / Together 配图

- **Pipeline** `payload.create({ collection: 'media' })`（例如 [`src/app/api/pipeline/media-image-generate/route.ts`](../../src/app/api/pipeline/media-image-generate/route.ts)）若报错 **`Failed query: insert into "media"`**，仍可能是 **`media.site_id` 指向 `sites_mig_old_20260629`**（与上文同一类漂移）。
- 先用 **`PRAGMA foreign_key_list(media)`**；若 **`site_id` 对应父表名为备份表**，应用迁移：**[`src/migrations/20260721_120000_repair_media_site_id_fk_to_sites.ts`](../../src/migrations/20260721_120000_repair_media_site_id_fk_to_sites.ts)**（逻辑与 `20260712` 对 pages/articles 相同，仅处理 `media`）。
- 若 FK 已指向 **`sites`**，再核对 **`sites.tenant_id` 在 `tenants` 表中有对应行**；否则也会出现 **FOREIGN KEY / SQLITE_CONSTRAINT**。

## 以后写迁移时的预防

- 凡是 **`ALTER TABLE`** / **`CREATE TABLE`** 涉及 **`sites`** 或与站点 id 有关的 FK，**自检**受影响集合是否仍指向备份表名。
- 若在本地已为某表修过 FK，线上库可能尚未执行同一条迁移，**不要在旧迁移文件里改 `up()`**，应 **新增迁移**。
- **`workflow_jobs.site_id`** 在历史上也可能仍指向备份表；若再次出现站点相关 FK 报错，同样用 `PRAGMA foreign_key_list(workflow_jobs)` 检查。
