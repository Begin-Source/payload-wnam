# Admin 顶栏后台任务 Banner（复现说明）

Payload Admin 顶部 **`fixed`** 细条，用于「关了弹窗仍在跑」的长耗时前台操作的会话态摘要。**每条表格的真源仍以 Payload 字段为准**（Together 封面：[`CategoryCoverWorkflowStatusCell`](../src/components/CategoryCoverWorkflowStatusCell.tsx)；分类槽位：[`CategorySlotsWorkflowStatusCell`](../src/components/CategorySlotsWorkflowStatusCell.tsx)；Merchant 拉品类目侧：[`CategoryMerchantOfferFetchWorkflowCell`](../src/components/CategoryMerchantOfferFetchWorkflowCell.tsx)）；Banner 只是同一浏览器标签页的 UX。

现阶段 **接入顶栏 Banner 的 `kind` 有三种**：`category-cover-sync`（Together · 分类封面）、`category-slots-sync`（快捷操作 · 生成分类槽位）、**`merchant-slot-dispatch-sync`**（快捷操作 · DataForSEO 分类槽位拉品／[`OfferMerchantSlotQuickActionModal`](../src/components/OfferMerchantSlotQuickActionModal.tsx)）。前两者与拉品派发在 **分类列表** 上主要通过 `router.refresh()` 看列状态；拉品任务 **结束**（类目「Merchant 拉品」列 `done`/`error` 或前台超时）后若当前在 **`/collections/offers`** 列表，Provider 亦会 **刷新 Offer 列表**（「槽位拉取」列）。

---

## 代码挂载在哪里

| 职责 | 路径 |
|------|------|
| 挂载整块后台：`providers` | [`payload.config.ts`](../src/payload.config.ts) → [`AdminBrandingProvider.tsx`](../src/components/AdminBrandingProvider.tsx) |
| Context / Hook、`jobs`、`complete`、`polling` | [`AdminBackgroundActivityProvider.tsx`](../src/components/adminBackgroundActivity/AdminBackgroundActivityProvider.tsx)、[`AdminBackgroundActivityContext.tsx`](../src/components/adminBackgroundActivity/AdminBackgroundActivityContext.tsx) |
| 横幅 UI | [`AdminBackgroundActivityBanner.tsx`](../src/components/adminBackgroundActivity/AdminBackgroundActivityBanner.tsx) |
| 「分类列表」链接前缀推导（租户前缀兼容） | [`categoriesListPath.ts`](../src/components/adminBackgroundActivity/categoriesListPath.ts) |

结构上：**Admin Background Provider → Banner → （effects → Payload Admin children）**。新增同类任务时：在 Context 增加 `kind` 与 `start* / complete* / fail*`；在 Banner 内为 `kind` 补文案与终态着色；把 **「是否有 running 且需刷分类列表（及拉品派发完成时刷 Offer 列表）」** 写进 Provider 里 **`setInterval`** 与 **complete/fail 回调**（与现有一致）。

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

### 无障碍

红条：**`aria-live="assertive"`、`role="alert"`**；绿条与运行中：**`polite` / `status`**（槽位失败同封面）。

### 多条任务时的展示优先级（单条 Banner）

仅 **三类 `kind`** 可能 `running`，但顶栏只占一行：

1. **只要存在** `category-cover-sync` **`running`**：先展示封面进行中（可多批聚合）；  
2. **否则**若有 `category-slots-sync` **`running`**：展示分类槽位进行中；  
3. **否则**若有 `merchant-slot-dispatch-sync` **`running`**：展示 DataForSEO 拉品 **等待 Webhook 写入 Offer**（进行中）；  
4. **皆无 running**：在所有已注册任务的 **terminal**（`succeeded` / `failed`）中取 **`startedAt` 最晚**一条。

---

## Banner 共性（交互）

- 「打开分类列表」：`pathname` 上截取 `/collections/` 前的前缀 + `/collections/categories`（见 `adminCategoriesListPath`）。
- **不显式自动隐藏**：终态与进行中的横幅均**仅**在用户点击右侧 **`×`** 时从 `jobs` 移除（调用 `dismissJob`）。关掉进行中横幅**不取消**后端请求，列表列状态仍会随任务结束而更新；仅在当前标签的 Banner 上不再展示该 job。

---

## Context 生命周期（接线约定）

- **封面**：[`CategoryCoverQuickActionModal`](../src/components/CategoryCoverQuickActionModal.tsx) — `startCategoryCoverJob → close() → fetch`（**不 Abort**）→ `completeCategoryCoverJob`（附带接口 `results` → `coverSyncResults`） / `failCategoryCoverJob`。  
- **分类槽位**：[`CategorySlotsQuickActionModal`](../src/components/CategorySlotsQuickActionModal.tsx) — **`startCategorySlotsJob` → 立刻 `close()`** → 后台 **`prepare` fetch** → 失败仅 **`failCategorySlotsJob`**（顶栏红条；弹窗已无）→ 成功则 **`afterPrepare` fetch** → `completeCategorySlotsJob`（附带 `results` → `slotsSyncResults`）/ `fail`。
- **DataForSEO 分类槽位拉品**：[`OfferMerchantSlotQuickActionModal`](../src/components/OfferMerchantSlotQuickActionModal.tsx) — **`startMerchantSlotDispatchJob` → 立刻 `close()`** → **`POST merchant-slot-fetch`** → **轮询** [`GET merchant-slot-dispatch-status`](../src/app/(payload)/api/admin/offers/merchant-slot-dispatch-status/route.ts) → `complete` / `fail`。派发阶段错误 **无弹窗**，仅顶栏红条。

---

## 列表刷新（进行中）

当 **顶栏任务**里 **`category-cover-sync`、`category-slots-sync` 或 `merchant-slot-dispatch-sync`** 存在 **`phase === 'running'`** 时：

- **`setInterval` 约 2000 ms**，仅在当前 **`pathname` 包含 `/collections/categories`** 时 **`router.refresh()`**（拉品 running 时同上，便于「Merchant 拉品」列及时更新）。  
- **停止条件**：非拉品任务 **120 s** 后停止 interval；**仅** `merchant-slot-dispatch-sync` **`running`** 时延长至 **约 15 min**（与前台 Webhook 等待窗口对齐）。超时只停列表轮询，不取消后台 Webhook。
- **`merchant-slot-dispatch-sync` 结束**（`complete` / `fail`）时：若路径含 **`/collections/categories`** 或 **`/collections/offers`**，各 **`router.refresh()`** 一次（覆盖在 Offer 页点拉品后回写槽位列的场景）。

---

## 验收清单（自查）

1. **封面**：分类列表触发 → 立即关弹窗 → 顶栏黄条；`failCount > 0` 红条；全成功绿条；终态可看 **逐条失败/成功摘要**（若有 `coverSyncResults`）。  
2. **分类槽位**：触发 → **立即关弹窗** → 顶栏黄条（`running`）；`prepare` 或后续请求失败 → 红条；全槽成功绿条；终态可看 **逐槽摘要**（若有 `slotsSyncResults`）。  
3. **`running` 抢显优先级**：封面先于分类槽位生成，再先于 **DataForSEO 拉品派发**；均无 `running` 时终态取 **最晚 `startedAt`**。  
4. Banner **不压住**快捷操作弹窗；无泄漏 `setInterval`。  
5. **终态**绿/红条在任务结束后会一直保持，直到用户点 **`×`**；**进行中**黄条也可点 **`×`** 仅隐藏提示（不中断请求）。  
6. **Merchant 拉品（槽位）**：触发 → **立即关弹窗** → **黄条直至 Webhook 写入完成或超时**；全类成功 **绿条**；任一类目失败/超时 **红条**；逐类摘要见 Banner（可与列表「Merchant 拉品」列对照）。

---

## 不改动的边界

- **不做**服务端 job 表（多标签页互不共享 Banner 状态；另一标签可看列表 DB 字段）。  
- **默认不**为同步请求挂 `AbortController`，除非单独需求引入「取消」。
