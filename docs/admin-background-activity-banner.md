# Admin 顶栏后台任务 Banner（复现说明）

Payload Admin 顶部 **`fixed`** 细条，用于「关了弹窗仍在跑」的长耗时前台操作的会话态摘要。**每条表格的真源仍以 Payload 字段为准**（Together 封面：[`CategoryCoverWorkflowStatusCell`](../src/components/CategoryCoverWorkflowStatusCell.tsx)；分类槽位：[`CategorySlotsWorkflowStatusCell`](../src/components/CategorySlotsWorkflowStatusCell.tsx)；Merchant 拉品类目侧：[`CategoryMerchantOfferFetchWorkflowCell`](../src/components/CategoryMerchantOfferFetchWorkflowCell.tsx)；信任页包 / 列表「信任页包」列：[`SitePagesBundleWorkflowStatusCell`](../src/components/SitePagesBundleWorkflowStatusCell.tsx)）；Banner 只是同一浏览器标签页的 UX。

现阶段 **接入顶栏 Banner 的 `kind` 有八种**：`category-cover-sync`（Together · 分类封面）、`category-slots-sync`（快捷操作 · 生成分类槽位）、**`merchant-slot-dispatch-sync`**（快捷操作 · DataForSEO 分类槽位拉品／[`OfferMerchantSlotQuickActionModal`](../src/components/OfferMerchantSlotQuickActionModal.tsx)）、**`trust-pages-bundle-sync`**（快捷操作 · 生成信任页包／[`TrustPagesBundleQuickActionModal`](../src/components/TrustPagesBundleQuickActionModal.tsx)）、**`keywords-dfs-fetch-sync`**（同步拉取 · DataForSEO（关键词）／[`KeywordSyncFetchDrawer`](../src/components/KeywordSyncFetchDrawer.tsx)）、**`keyword-quick-win-preview-sync`**（精选 Quick-win → Brief **预览候选**，[`POST batch-enqueue`](../src/app/(payload)/api/admin/articles/batch-enqueue/route.ts) `dryRun`／[`KeywordQuickWinDrawer`](../src/components/KeywordQuickWinDrawer.tsx)）、**`batch-enqueue-sync`**（内容大纲 **批量排产**，[`POST batch-enqueue`](../src/app/(payload)/api/admin/articles/batch-enqueue/route.ts) 默认入队／[`CollectionQuickActions`](../src/components/CollectionQuickActions.tsx)）、**`workflow-jobs-pipeline-sync`**（工作流任务列表 · **`POST /admin/pipeline/run-next`**／[`PipelineRunNextDrawer`](../src/components/PipelineRunNextDrawer.tsx)）。封面 / 槽位 / 拉品在 **分类**（及部分 **Offer**）列表上通过 `router.refresh()` 与列徽章对齐；信任页包在 **`/collections/pages`**；**DataForSEO 关键词同步**与 **Quick-win 预览**（SERP 聚类可能写回 `keywords`）在 **`/collections/keywords`** 与列表数据对齐；**批量排产**在 **`/collections/workflow-jobs`** 与 **`/collections/content-briefs`** 上随轮询 **`router.refresh()`**；**Pipeline Tick** 在 **`/collections/workflow-jobs`** 上随轮询 **`router.refresh()`**。

---

## 代码挂载在哪里

| 职责 | 路径 |
|------|------|
| 挂载整块后台：`providers` | [`payload.config.ts`](../src/payload.config.ts) → [`AdminBrandingProvider.tsx`](../src/components/AdminBrandingProvider.tsx) |
| Context / Hook、`jobs`、`complete`、`polling` | [`AdminBackgroundActivityProvider.tsx`](../src/components/adminBackgroundActivity/AdminBackgroundActivityProvider.tsx)、[`AdminBackgroundActivityContext.tsx`](../src/components/adminBackgroundActivity/AdminBackgroundActivityContext.tsx) |
| 横幅 UI | [`AdminBackgroundActivityBanner.tsx`](../src/components/adminBackgroundActivity/AdminBackgroundActivityBanner.tsx) |
| 「分类」「页面」「关键词」、**内容大纲**与**工作流任务**列表路径（租户前缀） | [`categoriesListPath.ts`](../src/components/adminBackgroundActivity/categoriesListPath.ts)（`adminCategoriesListPath`、`adminPagesListPath`、`adminKeywordsListPath`、`adminContentBriefsListPath`、`adminWorkflowJobsListPath`） |

结构上：**Admin Background Provider → Banner → （effects → Payload Admin children）**。新增同类任务时：在 Context 增加 `kind` 与 `start* / complete* / fail*`；在 Banner 内为 `kind` 补文案与终态着色；把 **「是否有 running 且需刷分类 / 页面 / 关键词 / 工作流任务列表」** 写进 Provider 里 **`setInterval`** 与 **complete/fail 回调**。

---

## 视觉叠层

- Banner：**`z-index: 9990`**（须低于快捷操作弹窗等大覆盖层的 **`10000`**，以免压住对话框）。
- 底栏：`position: fixed; top: 0; left/right: 0`。

---

## 颜色必须与列表徽章一致

底色 **不写浅色 `--theme-*-100`**（深色主题下易被吃掉）。必须与 [`workflowStatusBadge.tsx`](../src/components/workflowStatusBadge.tsx) 导出表 **`WORKFLOW_STATUS_STYLES`** 对齐（同款背景 / 正文色 / 底边）。

### Together · 分类封面（`category-cover-sync`）终态

| 场景 | Banner 色相（对应 badge key） |
|------|-------------------------------|
| 进行中 | **`running`**（琥珀黄 `#ca8a04`，白字） |
| HTTP 请求失败（`phase === 'failed'`） | **`error`**（红） |
| 接口返回成功但 **`failCount > 0`**（有条目生成失败） | **`error`**（红），**即使有成功也不算绿条** |
| **`phase === 'succeeded'` 且 `failCount === 0`**（全部条目成功） | **`done`**（绿） |

Together 封面在 HTTP 成功后，服务端 [`generate-cover-sync`](../src/app/(payload)/api/admin/categories/generate-cover-sync/route.ts) 会把 **`results`**（含可选 `name`/`slug`、`message`/`error` 等）一并返回。[`CategoryCoverQuickActionModal`](../src/components/CategoryCoverQuickActionModal.tsx) 将该数组传给 Context，存入 job 的 **`coverSyncResults`**。[`AdminBackgroundActivityBanner`](../src/components/adminBackgroundActivity/AdminBackgroundActivityBanner.tsx) 在终态：**第一行**仍是简短汇总（已成功 / 失败条数）；其下为逐条明细——**失败**条目各一行可读标签（`#categoryId` 在前，后接名称 / slug）与截断后的原因；**成功**条目至多列出 3 条预览，多余用省略；整块可用 **`title`（hover）** 查看更长摘要（前后端都会对过长文本截断）。

### 「快捷操作 · 生成分类槽位」（`category-slots-sync`）

成功完成 HTTP（`phase === 'succeeded'`）时，服务端 [`generate-slots`](../src/app/(payload)/api/admin/categories/generate-slots/route.ts) 在完成写回后对 **本站当前 locale** 下 **槽位 1–5** 再读一遍分类文档，响应携带 **`results`**（每槽一行：`slotIndex`、`ok`、`categoryId?`、`name?`、`slug?`、`message`/`error`）以及 **`okCount` / `failCount`**（与读回快照一致）。

[`CategorySlotsQuickActionModal`](../src/components/CategorySlotsQuickActionModal.tsx) 将该数组与安全解析后的条目传入 Context，存放在 job 的 **`slotsSyncResults`**。[`AdminBackgroundActivityBanner`](../src/components/adminBackgroundActivity/AdminBackgroundActivityBanner.tsx) 终态：**第一行**简短汇总「成功 × 条，失败 × 条」（可带所选站点括号标签）；以下为与封面 Banner 同款风格的明细（成功至多预览若干槽，`#categoryId` 在名称/slug **前**，缺文档的槽用 `#槽位n`；失败逐行截断；**`title`** 悬停更长摘要）。**只要 `failCount > 0`（含某槽读回缺文档）即红条**，与封面「有失即红」一致。

| 场景 | Banner 色相 |
|------|-------------|
| 进行中 | **`running`**（黄） |
| `phase === 'failed'`（HTTP/业务报错） | **`error`**（红） |
| `phase === 'succeeded'` 且 **`failCount > 0`** | **`error`**（红） |
| `phase === 'succeeded'` 且 **`failCount === 0`** | **`done`**（绿） |

较旧前台仅收到 `{ ok: true, siteId }` 而无 `results`（且无计数）时：**无明细**，仍沿用「已完成…请在列表确认」单行绿条文案。若服务端返回 **`okCount`/`failCount` 但未写入 `slotsSyncResults`**（例如前台解析失败），仍可显示汇总行并按失败数着色。

接线：**`startCategorySlotsJob` → 立刻 `close()`** → 后台 **`prepare` fetch** → 失败 **`failCategorySlotsJob`** → 成功则 **`afterPrepare` fetch** → **`completeCategorySlotsJob`（可带 `results` / 计数）/ `failCategorySlotsJob`**；**不弹右下角 toast**。（`prepare` 在关窗后执行；首轮失败无弹窗，仅顶栏红条。）

### 「快捷操作 · DataForSEO 分类槽位拉品」（`merchant-slot-dispatch-sync`）

**不建任务队列**：仍为单次同步 [`POST merchant-slot-fetch`](../src/app/(payload)/api/admin/offers/merchant-slot-fetch/route.ts)，在 HTTP 响应内完成 DFS `task_post` 派发及 Offer 槽位 **`running`** 标记；类目 **Offer 真实落库** 仍由 DataForSEO postback → [`/api/webhooks/dataforseo-merchant-offers`](../src/app/api/webhooks/dataforseo-merchant-offers/route.ts)。

[`OfferMerchantSlotQuickActionModal`](../src/components/OfferMerchantSlotQuickActionModal.tsx)：**`startMerchantSlotDispatchJob` → 立刻 `close()`** → **`POST merchant-slot-fetch`** → 前台 **`GET merchant-slot-dispatch-status`** **轮询**（约 2 s× ≤15 min）直至类目 **`merchantOfferFetchWorkflowStatus`** 为 **`done` / `error`**（或超时/批次漂移）→ **`completeMerchantSlotDispatchJob`** / **`failMerchantSlotDispatchJob`**。**绿条**表示 **Webhook 已把 Offer 写入流程跑完**（逐类可能仍有失败，见 `failCount`）；派发即失败仍红条。`results` 行上可带 **`writebackNote`**（如「Offer 已通过 Webhook 写入」）。

| 场景 | Banner 色相 |
|------|-------------|
| 进行中 | **`running`**（黄）：含「等待 Webhook 写入 Offer」 |
| `phase === 'failed'` | **`error`**（红） |
| `phase === 'succeeded'` 且 **`failCount > 0`** | **`error`**（红） |
| `phase === 'succeeded'` 且 **`failCount === 0`** | **`done`**（绿） |

### 「快捷操作 · 生成信任页包」（`trust-pages-bundle-sync`）

服务端 [`generate-trust-content`](../src/app/(payload)/api/admin/pages/generate-trust-content/route.ts)：与分类槽位相同的两段 **`prepare` → `afterPrepare`**；成功时在 JSON 中带 **`locale`（通常为 `en`）与 `slugs`（五个信任页 slug）**。

[`TrustPagesBundleQuickActionModal`](../src/components/TrustPagesBundleQuickActionModal.tsx)：**`startTrustPagesBundleJob` → 立刻 `close()`** → **`prepare`** → **`failTrustPagesBundleJob`** 或 **`afterPrepare`** → **`completeTrustPagesBundleJob`（写入 `trustPagesBundleSlugs` / `trustPagesBundleLocale`）**。运行中 Banner 文案指向页面列表「信任页包流程」列；**打开页面列表** 按钮对应 `adminPagesListPath`。

| 场景 | Banner 色相 |
|------|-------------|
| 进行中 | **`running`**（黄） |
| `phase === 'failed'` | **`error`**（红） |
| `phase === 'succeeded'` | **`done`**（绿）；明细为写回的 **slug** 列表 |

### 「同步拉取 · DataForSEO（关键词）」（`keywords-dfs-fetch-sync`）

服务端单次 [`POST dfs-fetch`](../src/app/(payload)/api/admin/keywords/dfs-fetch/route.ts)：Labs Keyword Suggestions → 按站点写入 **`keywords`**（`draft`）、打 **`eligible`**。

[`KeywordSyncFetchDrawer`](../src/components/KeywordSyncFetchDrawer.tsx)：**`startKeywordsDfsFetchJob` → 立刻 `close()`** → **`POST /api/admin/keywords/dfs-fetch`** → **`completeKeywordsDfsFetchJob`（`keywordDfsFetchSummary`）/ `failKeywordsDfsFetchJob`**。**进行中** Banner 文案指向关键词列表；**打开关键词列表** 按钮对应 **`adminKeywordsListPath`**。**终态**：若有任一行 **`persistError`**（写入失败），**红条**并预览失败词与原因；HTTP 成功且无误写失败则 **绿条**（汇总 `total` / `persisted` / `skipped` / `eligible` / DataForSEO USD）。

| 场景 | Banner 色相 |
|------|-------------|
| 进行中 | **`running`**（黄） |
| `phase === 'failed'` | **`error`**（红） |
| `phase === 'succeeded'` 且 **`keywordDfsFetchSummary.persistErrorCount > 0`** | **`error`**（红） |
| `phase === 'succeeded'` 且 **`persistErrorCount === 0`** | **`done`**（绿） |

### 「精选 Quick-win → Brief」预览候选（`keyword-quick-win-preview-sync`）

[`KeywordQuickWinDrawer`](../src/components/KeywordQuickWinDrawer.tsx) 内 **「预览候选」**：**`startKeywordQuickWinPreviewJob` → 立刻 `close()`** → **`POST batch-enqueue`**（`mode: quick_wins`，**`dryRun: true`**，可含 SERP 聚类）→ **`completeKeywordQuickWinPreviewJob`（`keywordQuickWinPreviewSummary` + `enqueueReplay` 快照）/ `failKeywordQuickWinPreviewJob`**。**进行中**：黄条 + **打开关键词列表**。**终态**：HTTP 失败红条；成功但 **`errorsSample`** 中出现 **「SERP 聚类失败」** 红条；否则 **绿条**（汇总 pillar 候选数、`skipped`、SERP 调用次数、簇数量；并可预览词条）。**绿条且 `pickedTotal > 0`** 时 Banner 还提供 **并入队 Brief**：用 **`enqueueReplay`** 再 **`POST batch-enqueue`（`dryRun: false`）**，成功后 **关闭该条 Banner** 并 **`router.refresh()`**；请求中按钮显示「入队中…」，失败在红字行展示原因。**不改变**抽屉内「并入队 Brief」按钮（仍可留在窗内进度与 **`lastResult`**）。

| 场景 | Banner 色相 |
|------|-------------|
| 进行中 | **`running`**（黄） |
| `phase === 'failed'` | **`error`**（红） |
| `phase === 'succeeded'` 且 **`notices` 含 SERP 聚类失败文** | **`error`**（红） |
| `phase === 'succeeded'` 且无上述失败 | **`done`**（绿） |

### 无障碍

红条：**`aria-live="assertive"`、`role="alert"`**；绿条与运行中：**`polite` / `status`**（槽位失败同封面）。

### 「快捷操作 · 批量排产」（`batch-enqueue-sync`）

[`POST batch-enqueue`](../src/app/(payload)/api/admin/articles/batch-enqueue/route.ts) 默认模式（非 `dryRun`）：按站点关键词 **`opportunityScore`** 等为本站创建 **`brief_generate`** 等工作流任务。

[`CollectionQuickActions`](../src/components/CollectionQuickActions.tsx) 内容大纲列表：**`startBatchEnqueueJob` → 立刻 `close()`** → **`POST batch-enqueue`** → **`completeBatchEnqueueJob`（`batchEnqueueSummary`）/ `failBatchEnqueueJob`**。**进行中**：黄条 + **打开工作流任务列表** + **打开内容大纲列表**。**终态**：HTTP 失败红条；成功时 **已入队 / 跳过** 汇总；**`enqueued === 0` 且 `errorsSample` 非空** 时红条并展示样例；否则绿条（可含「本批使用 draft 关键词」说明）。**不弹窗内 success toast**；与 Quick-win 预览（`dryRun`）区分 **`kind`**。

| 场景 | Banner 色相 |
|------|-------------|
| 进行中 | **`running`**（黄） |
| `phase === 'failed'` | **`error`**（红） |
| `phase === 'succeeded'` 且 **`enqueued === 0` 且 `errorsSample` 有内容** | **`error`**（红） |
| `phase === 'succeeded'` 且 **无上述情况** | **`done`**（绿） |

### 多条任务时的展示优先级（单条 Banner）

仅 **八类 `kind`** 可能 `running`，但顶栏只占一行：

1. **只要存在** `category-cover-sync` **`running`**：先展示封面进行中（可多批聚合）；  
2. **否则**若有 `category-slots-sync` **`running`**：展示分类槽位进行中；  
3. **否则**若有 `merchant-slot-dispatch-sync` **`running`**：展示 DataForSEO 拉品 **等待 Webhook 写入 Offer**（进行中）；  
4. **否则**若有 `trust-pages-bundle-sync` **`running`**：展示信任页包（OpenRouter）生成进行中；  
5. **否则**若有 **`keywords-dfs-fetch-sync`** **`running`**：展示 DataForSEO 关键词拉取进行中；  
6. **否则**若有 **`keyword-quick-win-preview-sync`** **`running`**：展示 Quick-win · **预览候选**（dryRun + 聚类）进行中；  
7. **否则**若有 **`batch-enqueue-sync`** **`running`**：展示 **批量排产**（`batch-enqueue` 入队）进行中；  
8. **否则**若有 **`workflow-jobs-pipeline-sync`** **`running`**：展示工作流 **`run-next`/tick** 进行中（可多批勾选 drain）；  
9. **皆无 running**：在所有已注册任务的 **terminal**（`succeeded` / `failed`）中取 **`startedAt` 最晚**一条。

---

## Banner 共性（交互）

- 「打开分类列表」：[`adminCategoriesListPath`](../src/components/adminBackgroundActivity/categoriesListPath.ts)。「打开页面列表」：[`adminPagesListPath`](../src/components/adminBackgroundActivity/categoriesListPath.ts)。「打开关键词列表」：[`adminKeywordsListPath`](../src/components/adminBackgroundActivity/categoriesListPath.ts)。「打开内容大纲列表」：[`adminContentBriefsListPath`](../src/components/adminBackgroundActivity/categoriesListPath.ts)。「打开工作流任务列表」：[`adminWorkflowJobsListPath`](../src/components/adminBackgroundActivity/categoriesListPath.ts)。**Quick-win 预览**终态绿条另有 **并入队 Brief**（与预览同参数、非 dryRun）。
- **不显式自动隐藏**：终态与进行中的横幅均**仅**在用户点击右侧 **`×`** 时从 `jobs` 移除（调用 `dismissJob`）。关掉进行中横幅**不取消**后端请求，列表列状态仍会随任务结束而更新；仅在当前标签的 Banner 上不再展示该 job。

---

## Context 生命周期（接线约定）

- **封面**：[`CategoryCoverQuickActionModal`](../src/components/CategoryCoverQuickActionModal.tsx) — `startCategoryCoverJob → close() → fetch`（**不 Abort**）→ `completeCategoryCoverJob`（附带接口 `results` → `coverSyncResults`） / `failCategoryCoverJob`。  
- **分类槽位**：[`CategorySlotsQuickActionModal`](../src/components/CategorySlotsQuickActionModal.tsx) — **`startCategorySlotsJob` → 立刻 `close()`** → 后台 **`prepare` fetch** → 失败仅 **`failCategorySlotsJob`**（顶栏红条；弹窗已无）→ 成功则 **`afterPrepare` fetch** → `completeCategorySlotsJob`（附带 `results` → `slotsSyncResults`）/ `fail`。
- **DataForSEO 分类槽位拉品**：[`OfferMerchantSlotQuickActionModal`](../src/components/OfferMerchantSlotQuickActionModal.tsx) — **`startMerchantSlotDispatchJob` → 立刻 `close()`** → **`POST merchant-slot-fetch`** → **轮询** [`GET merchant-slot-dispatch-status`](../src/app/(payload)/api/admin/offers/merchant-slot-dispatch-status/route.ts) → `complete` / `fail`。派发阶段错误 **无弹窗**，仅顶栏红条。
- **信任页包（en）**：[`TrustPagesBundleQuickActionModal`](../src/components/TrustPagesBundleQuickActionModal.tsx) — **`startTrustPagesBundleJob` → 立刻 `close()`** → **`POST generate-trust-content`**（`prepare` / `afterPrepare`）→ `completeTrustPagesBundleJob` / `failTrustPagesBundleJob`。
- **DataForSEO 关键词**：[`KeywordSyncFetchDrawer`](../src/components/KeywordSyncFetchDrawer.tsx) — **`startKeywordsDfsFetchJob` → 立刻 `close()`** → **`POST dfs-fetch`** → `completeKeywordsDfsFetchJob` / `failKeywordsDfsFetchJob`。
- **Quick-win 预览候选**：[`KeywordQuickWinDrawer`](../src/components/KeywordQuickWinDrawer.tsx) — **「预览候选」**：**`startKeywordQuickWinPreviewJob` → 立刻 `close()`** → **`POST batch-enqueue`（`dryRun: true`）** → `completeKeywordQuickWinPreviewJob` / `failKeywordQuickWinPreviewJob`；预览绿条可再点 **`POST batch-enqueue`（`dryRun: false`）** **并入队**（见 Banner 按钮）。
- **内容大纲 · 批量排产**：[`CollectionQuickActions`](../src/components/CollectionQuickActions.tsx) — **`startBatchEnqueueJob` → 立刻 `close()`** → **`POST batch-enqueue`**（默认非 dryRun）→ `completeBatchEnqueueJob` / `failBatchEnqueueJob`。
- **工作流 · Pipeline**：[`PipelineRunNextDrawer`](../src/components/PipelineRunNextDrawer.tsx) — **`startWorkflowJobsPipelineJob` → 立刻 `close()`** → **`POST /api/admin/pipeline/run-next`**（可多轮勾选 drain）；`updateWorkflowJobsPipelineJobProgress` 更新横幅进度 → **`completeWorkflowJobsPipelineJob` / `failWorkflowJobsPipelineJob`**。不显式挂载 `AbortController`（与其它同步型 Banner 接线一致）。

---

## 列表刷新（进行中）

当 **`category-cover-sync`、`category-slots-sync`、`merchant-slot-dispatch-sync`、`trust-pages-bundle-sync`、`keywords-dfs-fetch-sync`、`keyword-quick-win-preview-sync`、`batch-enqueue-sync` 或 `workflow-jobs-pipeline-sync`** 存在 **`phase === 'running'`** 时：

- **`setInterval` 约 2000 ms**：当前路径含 **`/collections/categories`** 时 **`router.refresh()`**；含 **`/collections/pages`** 时 **`refresh()`**；含 **`/collections/keywords`** 时 **`refresh()`**；含 **`/collections/content-briefs`** 或 **`/collections/workflow-jobs`** 时 **`refresh()`**（同一次 tick 可依路径各刷一次）。
- **停止上限**：基数 **120 s**；若含 **`merchant-slot-dispatch-sync`** 则提升至 **至多约 15 min**；若含 **`trust-pages-bundle-sync`**、**`keywords-dfs-fetch-sync`**、**`keyword-quick-win-preview-sync`**、**`batch-enqueue-sync`** 或 **`workflow-jobs-pipeline-sync`**（或多项同时）则提升至 **至多约 30 min**（取 `Math.max`；其中 **`workflow-jobs-pipeline-sync`** 与 drain 合用 **约 30 min**）。超时只停轮询。
- **`merchant-slot-dispatch-sync` 结束**：路径含 **`/collections/categories`** 或 **`/collections/offers`** 时 **`router.refresh()`**。**`trust-pages-bundle-sync` 结束**：路径含 **`/collections/pages`** 时 **`router.refresh()`**。**`keywords-dfs-fetch-sync`** 或 **`keyword-quick-win-preview-sync` 结束**：路径含 **`/collections/keywords`** 时 **`router.refresh()`**。**`batch-enqueue-sync` 结束**：路径含 **`/collections/workflow-jobs`** 或 **`/collections/content-briefs`** 时 **`router.refresh()`**。**`workflow-jobs-pipeline-sync` 结束**：路径含 **`/collections/workflow-jobs`** 时 **`router.refresh()`**。

---

## 验收清单（自查）

1. **封面**：分类列表触发 → 立即关弹窗 → 顶栏黄条；`failCount > 0` 红条；全成功绿条；终态可看 **逐条失败/成功摘要**（若有 `coverSyncResults`）。  
2. **分类槽位**：触发 → **立即关弹窗** → 顶栏黄条（`running`）；`prepare` 或后续请求失败 → 红条；全槽成功绿条；终态可看 **逐槽摘要**（若有 `slotsSyncResults`）。  
3. **`running` 抢显优先级**：封面 → 分类槽位 → **拉品派发** → **信任页包** → **关键词 DFS 拉取** → **Quick-win 预览候选** → **批量排产** → **Pipeline 工作流**；均无 `running` 时终态取 **最晚 `startedAt`**。  
4. Banner **不压住**快捷操作弹窗；无泄漏 `setInterval`。  
5. **终态**绿/红条在任务结束后会一直保持，直到用户点 **`×`**；**进行中**黄条也可点 **`×`** 仅隐藏提示（不中断请求）。  
6. **Merchant 拉品（槽位）**：触发 → **立即关弹窗** → **黄条直至 Webhook 写入完成或超时**；全类成功 **绿条**；任一类目失败/超时 **红条**；逐类摘要见 Banner（可与列表「Merchant 拉品」列对照）。  
7. **信任页包（en）**：触发 → **立即关弹窗** → 顶栏 **黄条**；`prepare`/生成失败 → **红条**；成功 → **绿条**（含 slug 明细）；进行中 / 完成后在 **`/collections/pages`** 上随轮询 **`refresh`**。  
8. **DataForSEO 关键词**：触发 → **立即关弹窗** → 顶栏 **黄条**；HTTP / 业务失败 → **红条**；成功且无生库失败 → **绿条**（汇总与 USD）；有 **`persistError`** → **红条**（含失败词预览）；进行中 / 完成后在 **`/collections/keywords`** 上随轮询 **`refresh`**。  
9. **Quick-win 预览候选**：点 **预览候选** → **立即关弹窗** → 顶栏 **黄条** → 完成 **绿条**（或 SERP 聚类失败摘要 → **红条**，无并入队按钮）；绿条且有 pillar 时可点 Banner **并入队 Brief** → **`dryRun: false`** 入队成功后横幅关闭并刷新列表；**/并入队 Brief** 仍可只在抽屉内使用。
10. **工作流 Pipeline**：点 **「执行下 N 条」** → **立即关弹窗** → 顶栏 **黄条**（多批时显示已累计批次数）；HTTP 或未捕获错误 → **红条**（`phase: failed`）；正常结束摘要 → **绿条**（或 **`tickFailures` / 分批上限 errorHint** → **红条**）；进行中及完成后 **`/collections/workflow-jobs`** 上随 **`router.refresh`** 更新列表。
11. **内容大纲 · 批量排产**：点 **「执行批量排产」** → **立即关弹窗** → 顶栏 **黄条**；HTTP / 未捕获错误 → **红条**；成功 → **绿条**（已入队 / 跳过 / draft 关键词提示）；**入队 0 且有 `errorsSample`** → **红条**；进行中 / 完成后在 **`/collections/workflow-jobs`** 与 **`/collections/content-briefs`** 上随轮询 **`refresh`**。

---

## 不改动的边界

- **不做**服务端 job 表（多标签页互不共享 Banner 状态；另一标签可看列表 DB 字段）。  
- **默认不**为同步请求挂 `AbortController`，除非单独需求引入「取消」。
