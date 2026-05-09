---
name: 分类封面表格内同步执行
overview: 「Together · 分类封面」改为不入队——在管理员已登录的请求内顺序执行生成逻辑并写回 `categoryCoverWorkflowStatus`，列表表格用徽章反映运行中 / 已完成 / 错误（与现有槽位/Merchant 列一致）。
todos:
  - id: migrate-field
    content: categories 表 + Categories 字段 + CategoryCoverWorkflowStatusCell + defaultColumns
    status: pending
  - id: extract-core
    content: 从 category-cover-generate/route 抽出可复用的生成函数供 Admin 路由调用（避免重复 Together/写媒体逻辑）
    status: pending
  - id: admin-sync-route
    content: 新或改造 admin POST：按勾选顺序逐条 running → core → done/error；并发/重复提交用字段或简单锁防抖
    status: pending
  - id: modal-ui
    content: CategoryCoverQuickActionModal 改为调同步接口；文案去掉工作流任务；submitting 直至整批结束；成功后 router.refresh
    status: pending
  - id: deprecate-queue-ui
    content: queue-ai-cover 可保留给其它调用者或标注废弃；前端路径不再创建 category_cover_generate 任务（若暂无其它引用可考虑删除冗余）
    status: pending
  - id: types
    content: pnpm run generate:types（+ importmap 若增组件路径）
    status: pending
isProject: false
---

# 分类 Together 封面：表格侧同步执行（不入队）

## 与用户迭代的对齐

你确认该流程较短、**不需要入队**。则本次**不再依赖**：

- `/api/admin/categories/queue-ai-cover` 创建 `workflow-jobs`
- `pipeline/tick` 对 `category_cover_generate` 的调度

转为：在 **`CategoryCoverQuickActionModal`**（从分类列表进入）单次 `fetch` **串行执行**所选分类封面生成，生命周期内更新分类上的 **`categoryCoverWorkflowStatus`**，关闭/刷新后在**同一列表表格**中看到徽章进度（类比现有「槽位流程」「Merchant 拉品」，但数据源来自本次同步请求）。

## 数据与 UI（保留原计划中有用的部分）

- D1 迁移：为 `categories` 增加 `category_cover_workflow_status`（默认 `idle`，取值与 [`workflowIdleRunningDoneErrorSelectOptions`](src/collections/shared/workflowIdleRunningDoneErrorSelectOptions.ts) 一致）。
- [`Categories`](src/collections/Categories.ts)：`categoryCoverWorkflowStatus` + 列表 **`Cell`**（新建 `CategoryCoverWorkflowStatusCell`，同 Merchant 徽章模式）。
- [`defaultColumns`](src/collections/Categories.ts)：加入该列。

## 执行路径（替换入队）

1. **核心业务**已从 [`category-cover-generate/route.ts`](src/app/api/pipeline/category-cover-generate/route.ts) 写好；应避免 Admin 里去 **HTTP 再打一遍 pipeline**（要挂 internal auth、双倍超时）。应在 `src/utilities/`（或同级）抽出 **`runCategoryCoverGenerate`**（签名含 `payload` + `categoryId` + 可选 prompt），由原 pipeline `POST` handler 与该函数各一层薄封装。
2. **新 Admin 路由**（例如 `POST /api/admin/categories/generate-cover-sync`）：Cookie 租户校验与同 [`queue-ai-cover/route.ts`](src/app/(payload)/api/admin/categories/queue-ai-cover/route.ts)。
3. 对每个 `categoryId`（校验 site 归属后）：
   - `payload.update`: `categoryCoverWorkflowStatus = 'running'`
   - `await runCategoryCoverGenerate(...)`
   - 成功：`done`；捕获异常：`error`（与 pipeline 返回值约定一致）。
4. 返回 JSON：`{ ok, results: [{ categoryId, ok, error? }, ...] }`，便于 Modal 摘要。

### 防抖 / 与其它入口

- 「已在运行」：可读当前分类字段若为 `running` 则跳过或整批报错（避免与旧逻辑的 `pendingCategoryCoverJob` 扫表重复——以**文档字段为准**）。
- 若希望以后仍允许「慢队列」：**可保留** [`queue-ai-cover`](src/app/(payload)/api/admin/categories/queue-ai-cover/route.ts) 与 `workflow-jobs`，但 **Modal 只做同步路径**，避免两套入口同时写同一字段（若保留双入口，须在文档中写清优先级）。

### 超时与批量

- Cloudflare Workers / 浏览器可能对**长请求**有限制；勾选数量建议：**同步接口硬上限收紧**（例如单次 ≤10，或单次仅 1 个并在 UI 提示「多选用队列」——若你已确定永远短流程，可保持一个合理上限）。
- Modal：`submitting === true` 覆盖整段时间；可选次要文案「正在处理第 i/n 条」。

## 前端

- [`CategoryCoverQuickActionModal.tsx`](src/components/CategoryCoverQuickActionModal.tsx)：`fetch` 指向同步路由；成功提示改为「已完成 n 条，失败 k 条…」；`router.refresh()` 后在列表中看到徽章。
- 说明文案删掉「pipeline tick」「工作流任务」等Enqueue描述。

## 不需要改动的文件（相对上一版）

- **[`tick/route.ts`](src/app/api/pipeline/tick/route.ts)**：不必为封面任务增加分类写回（除非仍保留 enqueue 备选路径）。
- **`workflow_job` 枚举**：可保留类型 `category_cover_generate` 以备手工建任务或其它集成。

## 验收

- 勾 1～N 条分类提交 → Modal 结束前列表（或完成后 refresh）各行 **Together 封面**列：`运行中` → `已完成`/`错误`。
- 不再产生新的 `category_cover_generate` pending 记录（若以同步为唯一入口）。
