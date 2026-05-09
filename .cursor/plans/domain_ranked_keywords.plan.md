# 域名出词写入排名快照（合并版）

## 目标

- 调用 DataForSEO Labs `POST /v3/dataforseo_labs/google/ranked_keywords/live`，以站点主域（或可覆盖的 `target`）拉取出词。
- 每条关键词写入 [`src/collections/Rankings.ts`](src/collections/Rankings.ts)，用 **`rankingSource`** 区分：
  - `serp_live` — 现有 [`rank-track/route.ts`](src/app/api/pipeline/rank-track/route.ts)。
  - `domain_ranked_keywords` — Labs 域名出词导入。
- [`triage/route.ts`](src/app/api/pipeline/triage/route.ts) 的 `latestRankings` **仅看 `serp_live`**（legacy null 视为 `serp_live`），避免 Labs 位次污染文章生命周期。

## 费用与「一次拉全、少再付费」策略（迭代要求）

**原则：不启用 DataForSEO 明确加价的可选参数；在单次请求的默认响应里，把能带的指标尽量原样落库，减少日后为同一批词再调 Keywords/Labs 接口。**

1. **`include_clickstream_data`**：文档写明为 `true` 时 **约双倍计费** —— **默认保持 `false`**，不纳入「不增加费用」方案。
2. **单次 `limit`**：在 DFS 允许范围内（max 1000），用请求参数一次拉足本批需要的条数；**分页 `offset` 每页都是独立计费** —— 若产品要「全量出词」，应在计划中写明：要么接受多页多次费用，要么首版用单页大 `limit` + 文档说明未覆盖 `total_count` 时需用户主动再跑（会再计费）。
3. **`item_types`**：默认用 `["organic"]` 即可聚焦自然出词；若需同时带回 paid 等且**不额外加价**（以官方计费为准），可在实现前对照 [DataForSEO Labs 定价页](https://dataforseo.com/pricing) 再定；有疑虑则保持最窄 `organic`。
4. **`load_rank_absolute`**：文档为可选布尔，若**不额外加价**，实现时设为 `true` 以拿到 `metrics_absolute` 分布（若响应无该字段则忽略）。
5. **落库粒度（核心）**：每条 `rankings` 的 **`rawSerp`（或专用 JSON 字段，二选一）** 存 **该 item 的完整子树**，至少包含：
   - `keyword`（词面）
   - `keyword_data` 全文（含 `keyword_info`：volume/cpc/competition 等、`keyword_difficulty`、`search_intent_info` / `main_intent`、`impressions` 等文档列出的字段）
   - `ranked_serp_element` 全文（含 `serp_item` 的 rank、url、type 等）
   - 可选：在顶层再加 `_ingest: { source: 'domain_ranked_keywords', apiPath, capturedAt, target, location_code, language_code }` 便于审计  
   不在每条里重复存整包 `tasks[0].result`（避免 DB 膨胀）；**整包响应**可在路由 JSON 返回体里可选 `debugEnvelope: false` 默认关闭，或仅日志摘要。
6. **标量冗余（可选、便于 Admin）**：从 `keyword_data` 解析出 `volume` / `kd` / `intent` 写入 `rankings` 新字段需迁移；若首版只做 JSON 全量落库，也能满足「日后不二次调用取指标」——**优先保证 JSON 全量**，标量列为第二阶段（本计划倾向首版 JSON 全量 + 已有 `serpPosition`/`searchQuery`）。

## 实现清单（与初版一致处）

- D1 迁移：`rankings.ranking_source`；`rank-track` 写 `serp_live`；triage 过滤。
- 新路由 `POST /api/pipeline/domain-ranked-keywords`（路径以仓库惯例为准）：鉴权、`resolveMergedForPipelineRoute`、DFS 调用、quota、`payload.create` 循环。
- `pnpm run generate:types`；解析单测（fixture 来自官方示例 JSON 片段）。
- Admin：`defaultColumns` 含 `rankingSource`。

## Todos

- [x] schema-migration：`rankingSource` + 迁移；legacy 默认
- [x] rank-track-source：`rank-track` 显式 `serp_live`；`latestRankings` 仅 serp_live
- [x] domain-route：Labs 调用 + **每行全量 `keyword_data` + `ranked_serp_element` 落 `rawSerp`**；**不**开 `include_clickstream_data`；按需 `load_rank_absolute`
- [x] tests-types：解析测试 + generate:types
