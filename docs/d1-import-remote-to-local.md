# 云端 D1 导入本地（Wrangler + Payload）

将 Cloudflare **远程** D1 中的数据库内容同步到本机 **Miniflare 本地** D1，便于在 `pnpm dev` 下调试与内容联调。

## 适用场景

- 线上（Workers 部署环境）已有一批 Payload 业务数据，希望在本地 Admin / API 中使用**同一套表数据**。
- **不包含 R2**：媒体文件仍在云端桶中；若本地需要直连线上媒体或使用本地副本，请另用 [Wrangler R2](https://developers.cloudflare.com/r2/) / `rclone` 等同步对象，本文不覆盖。

## 前置条件

- 在**项目根目录**（与 `package.json` 同级）执行命令；已执行 `pnpm install`。
- 已登录 Cloudflare CLI：`pnpm exec wrangler login`（远程 `d1 export` 依赖有效身份与账号权限）。
- 与当前仓库配置一致（见 [wrangler.jsonc](../wrangler.jsonc)）：
  - 远程数据库 **名称**：`payload-wnam`（`database_name`）。
  - 本地 `d1 execute` 使用的 **binding 名**：`D1`（`d1_databases[].binding`）。

可用下列命令确认远程库名：

```bash
pnpm exec wrangler d1 list
```

## 推荐流程（每次导入）

下列步骤会**覆盖本地 Wrangler 保存的那一份本地 D1**；请先备份你仍需要的**仅存在于本地**的数据。

1. **停止**占用本地 D1 的进程（务必先停 **`pnpm dev`**，避免 Miniflare 占用或中途写库）。

2. **从远程导出**（可按需改输出文件名，避免覆盖旧备份，例如 `./remote-d1-2026-04-29.sql`）：

   ```bash
   pnpm exec wrangler d1 export payload-wnam --remote --output=./remote-d1.sql
   ```

3. **生成用于导入的 SQL**（去掉列级 `REFERENCES` 与表级 `FOREIGN KEY … REFERENCES …`，避免 Wrangler 整库导出常见的语句顺序导致 `no such table` / `already exists`）：

   ```bash
   node scripts/strip-d1-column-references.mjs remote-d1.sql remote-d1-import.sql
   ```

   脚本说明见 [scripts/strip-d1-column-references.mjs](../scripts/strip-d1-column-references.mjs)。不传参时默认读 `remote-d1.sql`、写 `remote-d1-import.sql`。

4. **清空本地 D1 状态**（本地 SQLite 存放在 `.wrangler/state` 下）：

   ```bash
   rm -rf .wrangler/state/v3/d1
   ```

   若仍有异常，可扩大为 `rm -rf .wrangler/state`（会清除更多本地 Wrangler 状态，请确认无其它依赖）。

5. **将 SQL 灌入本地绑定 `D1`**：

   ```bash
   pnpm exec wrangler d1 execute D1 --local --file=./remote-d1-import.sql
   ```

6. **重新启动开发服务**：

   ```bash
   pnpm dev
   ```

## 排错摘要

| 现象 | 处理方向 |
|------|----------|
| 导出失败：`Authentication error [code: 10000]` | 执行 `pnpm exec wrangler logout` 后重新 `wrangler login`；或查看 `~/Library/Preferences/.wrangler/logs/` 下对应日志（路径以本机为准）。 |
| 直接导入**未 strip** 的整包 SQL：`table … already exists`、`no such table: main.xxx` |  remote 导出语句顺序与空库不兼容；请**始终**先跑 `strip-d1-column-references.mjs`，再对 **`remote-d1-import.sql`** 执行 `d1 execute --local`。 |
| 导入报语法错误 / 偏移量错误 | 确认使用的是 strip 后的文件；必要时重新从远程导出再 strip。 |

**外键说明**：经脚本处理后的本地库**不再包含 SQLite 外键约束**，便于一次性导入；Payload 与 Drizzle 仍按应用层模型读写，一般无需在本地依赖 DB 级 FK。

## 可选：替代路线（保留外键时）

若你希望本地库**保留** `REFERENCES` / `FOREIGN KEY`（更接近「真」SQLite 约束），可走 Cloudflare 文档中的思路：远程 **`--no-schema` 仅导数据**，本地先 **`pnpm exec payload migrate`** 建表，再导入数据文件；注意迁移表与 `INSERT` 顺序、唯一约束等。详见官方：[Import and export data (D1)](https://developers.cloudflare.com/d1/best-practices/import-export-data/)。

## 安全提示

- 导出文件通常包含用户邮箱、密码哈希、业务内容等**敏感信息**。
- 不要将 `remote-d1.sql`、`remote-d1-import.sql` 提交到 Git 或发到公开渠道；可考虑加入 `.gitignore` 或只保留在私密路径。
