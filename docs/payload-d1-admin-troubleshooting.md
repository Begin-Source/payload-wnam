# Payload + D1：后台集合详情页「只有面包屑、内容区空白」

Cursor 在仓库 [`.cursor/rules/payload-project.mdc`](../.cursor/rules/payload-project.mdc) 的 Migrations 一条中已链到本文，避免新增 collection 时漏改 `payload_locked_documents_rels`。

## 现象

在 Payload Admin 中从侧边栏进入某个集合的**列表**正常，点进**单条记录**（如 `/admin/collections/categories/1`）时，中间内容区为空白，只保留顶栏/面包屑；**不只某一个集合**，很多集合的详情页都会出现。

## 根因

Payload 3 在渲染任意 Document 视图时会走 `getIsLocked`（协作文档锁定相关），其中会 join 系统表 `payload_locked_documents` 与 `payload_locked_documents_rels`，并在 `WHERE` 里对 **config 中注册的每一个 collection** 对应一列外键做条件，例如 `… content_briefs_id = ? OR … serp_snapshots_id = ? …`。

`payload_locked_documents_rels` 的列与集合一一对应。若你在 `payload.config.ts` 里**新增了 collection**，也创建了业务表，但**没有在 `payload_locked_documents_rels` 上增加对应外键列**，D1/SQLite 会报错：

- `D1_ERROR: no such column: … content_briefs_id`（或类似 `*_id` 列名）

服务端请求仍可能返回 200，但 RSC/渲染会失败，结果表现为**详情页内容空白**。

## 如何快速确认

1. **看 dev server 终端日志**（`pnpm run dev`）：搜索 `getIsLocked`、`payload_locked_documents_rels`、`no such column`。
2. **查表结构**（本地 D1）：

   ```bash
   pnpm exec wrangler d1 execute D1 --local --command "PRAGMA table_info(payload_locked_documents_rels)"
   ```

   将输出中的 `name` 列与 `src/payload.config.ts` 里 `collections` 的 slug 对照：应存在形如 `{collection_slug_underscores}_id` 的列（如 `content-briefs` → `content_briefs_id`）。

## 正确修复方式

1. **不要**在已跑过的历史迁移上直接改 `up()`：库里的 `payload_migrations` 已记录该迁移，Payload **不会**重跑。
2. **新增**一条迁移，用 `ALTER TABLE … ADD` 给 `payload_locked_documents_rels` 补缺失的列，并加 `CREATE INDEX IF NOT EXISTS …`，与仓库里其它迁移中的 `addLockedDocumentsRels…` 模式一致（例如 [src/migrations/20260421_150000_announcements_collection.ts](../src/migrations/20260421_150000_announcements_collection.ts)、[src/migrations/20260429_120000_payload_automation.ts](../src/migrations/20260429_120000_payload_automation.ts)）。
3. 在 [src/migrations/index.ts](../src/migrations/index.ts) 注册新迁移，执行：

   ```bash
   pnpm exec payload migrate
   ```

4. 本项目已有一次性修复参考：[src/migrations/20260430_130000_fix_locked_docs_rels.ts](../src/migrations/20260430_130000_fix_locked_docs_rels.ts)（为 `content_briefs` / `serp_snapshots` / `authors` / `original_evidence` / `page_link_graph` 补列）。

## 以后如何避免

在**同一批**向 `payload.config.ts` 增加新 `CollectionConfig` 的迁移里，除了建业务表、改 `*_rels` 等业务表，**同时**在 `up()` 末尾调用一段逻辑：对 `PRAGMA table_info('payload_locked_documents_rels')` 做检查，为每个新 collection 补 `…_id` 列 + 索引（可仿照上节链接里的写法）。这样 `getIsLocked` 的查询与表结构始终一致，不会再出现整站详情页空白类问题。

## 相关说明

- `payload_preferences_rels` 等其它系统表按 Payload 设计**不一定**需要为所有集合都加列；出问题时重点先查 `payload_locked_documents_rels`。
- 生产环境 D1 部署后，记得在目标环境再执行 `payload migrate`（若使用 Wrangler 远程库，需按你现有的 CI/部署流程对 `--remote` 等参数执行一次）。
