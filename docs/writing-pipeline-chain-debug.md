# 写作流水线链条排雷（draft_skeleton → draft_section）

其它症状（OpenRouter 拉模型列表、MaxListeners、总览选线）见 [troubleshooting-runbook.md](./troubleshooting-runbook.md)。

服务端已加入结构化诊断日志（`[chain]` / `[pipeline/tick] draft_skeleton chain`）。本文档用于 **Phase 1 人工核查**、**复现后收集日志** 与 **根因 → 修复方向** 对照。

## 现象对齐（与 Admin 表述）

**用户侧描述**：`Draft skeleton` 跑完后（例如对应 **brief #1**），下一步**没有写入新的工作流任务**，因此后续没有东西可执行。

**与代码预期一致**：`draft_skeleton` 成功后，由 `enqueueDraftSectionsAfterSkeleton` → `enqueueAvailableDraftSectionJobs` 在 **`workflow-jobs`** 里 **`payload.create` 多条 `jobType: draft_section`**（每条挂 `article` + `contentBrief`）。若列表里完全没有新的 `draft_section` 行，就是「入队这一步没产生文档」，与上述现象相同。

**容易混淆的一点**：下一步**不是**再跑一遍「brief」任务（不是 `brief_generate`）；`draft_skeleton` 本身已经挂在 **brief #1** 上。你在列表里看到的下一条若仍带 brief 文案，正常应是 **「Draft section … → article #N」**，`contentBrief` 仍指向同一 brief。

## 顶栏 Banner 截图（无需翻终端）

「一键跑通写作流水线」与 **Pipeline run-next** 的请求体会带上 **`debugBanner: true`**，服务端在 tick 上设置 **`x-pipeline-banner-hints: 1`**，响应 JSON 中的 **`bannerHints`**（短字符串数组）会汇总到 Admin **顶栏黄色运行中 Banner** 下的等宽区域；结束后同一段摘要会出现在 **绿色/红色完成 Banner** 里（`pipelineBannerHints`）。

- **典型行**：`draft_skeleton pre articleId=…`、`draft_skeleton sectionsEnqueued=N`、`tick done jobType=…`；`N=0` 且 brief/article id 正常时重点查 Pipeline Settings 白名单与 `SQLITE_BUSY`。
- **生产**：默认不在响应里带排查行；仅当客户端发 `debugBanner: true`（当前写作/ run-next 抽屉已硬开）或对 tick 显式带 header / 设置环境变量 `PIPELINE_BANNER_HINTS=1`（见 [`pipelineBannerHints.ts`](../src/utilities/pipelineBannerHints.ts)）时 tick 才返回 `bannerHints`。

## 把「较完整」的终端日志放到 docs（给助手读）

自动化流水线**不会**把完整服务器日志写入仓库（避免密钥、cookie、LLM 原文进 Git）。你可以在本地把终端里 **`pnpm dev` / Worker 相关片段** 复制保存到**固定路径**，这样在会话里我可以直接读该文件：

1. 仓库已用 [`.gitignore`](../.gitignore) 忽略 `docs/pipeline-debug.local.log` / `.txt`（勿提交这些文件）。
2. 创建或覆盖其中任一文件：
   - `docs/pipeline-debug.local.log`，或
   - `docs/pipeline-debug.local.txt`
3. 建议从「点击一键流水线之前」开始，到「黄条消失或报错之后」为止，整块复制进去保存。
4. 粘贴前请自行删除明显敏感行（如 `Authorization`、`Cookie`、`x-internal-token` 若曾出现在代理日志里）。

Banner 里的 `bannerHints` 仍是**短、脱敏**摘要；本地 log 文件可以是**更长**的终端输出，用于和 Banner 对照。

## Together 配图与写作 batch

关闭 **Globals → Pipeline Settings** 或对应 **Pipeline Profile** 中的 **Together 配图**（`togetherImageEnabled`）后：`draft_finalize` 完成时**不会**再创建 `image_generate`；若库里仍有 pending 的 `image_generate`，`/api/pipeline/tick` 会将其直接标为 **completed**（`output.ok: true`，`skipped: true`，`reason: together_image_disabled`）并继续 `markArticlePublishReady`，避免 **run-scoped-batch / run-next** 在 `stopOnFailure` 下被 Together 503 或 `together_image_disabled` 403 卡死。正文仍只有骨架注释时请看 `[chain]` 里 `doneCount` / `draft_section` 是否「假完成」，与本节无关。

## Phase 1 — Admin / 日志只读核查

1. **Workflow Jobs**：打开刚完成的 `draft_skeleton` 任务，查看 `output` JSON。期望含 `ok: true` 与 **数值型** `articleId`（执行器返回体为 `{ ok: true, articleId }`，无 `id` 字段）。
2. 同一条任务的 **article** 关联是否指向正确文章（可选；链条主要用 `output.articleId` 与 `contentBrief`）。
3. **Content Briefs**：目标 brief 的 `outline.sections` 是否有 `id` / `type`。若为空，会 fallback 为 `intro` / `body` / `faq` / `conclusion`（多数 `sectionType` 为 `custom`）。
4. **Globals → Pipeline Settings**：`sectionParallelism`、`sectionVariant`、`sectionParallelWhitelist`（白名单过窄会导致首段后 `gated`）。
5. **终端 / 观测**：在 skeleton 完成时间点附近搜索：
   - `[pipeline/tick] draft_skeleton chain: enqueueDraftSectionsAfterSkeleton input`
   - `[chain] enqueueDraftSectionsAfterSkeleton`
   - `[chain] enqueueAvailableDraftSectionJobs start` / `complete`
   - `[chain] draft_section enqueue decision`
   - `[pipeline/tick] chained pipeline enqueue failed`
   - `[chain] enqueueDraftSectionsAfterSkeleton skipped: article/brief id non-numeric`
6. **Workflow Jobs 过滤**：`article = <skeleton output 的 articleId>` 且 `jobType = draft_section`，确认是否完全没有 pending/completed 记录。

## Phase 2 — 复现后收集日志（一键流水线后再看终端）

按时间顺序应能看到：

| 日志前缀 | 含义 |
|----------|------|
| `[pipeline/tick] draft_skeleton chain: enqueueDraftSectionsAfterSkeleton input` | tick 传入链路的 `articleIdFromOutput`、`briefForChain`、`outputHasArticleId` |
| `[chain] enqueueDraftSectionsAfterSkeleton input` | 原始 `rawArticleId` / `rawBriefId` |
| `[chain] enqueueDraftSectionsAfterSkeleton skipped: article/brief id non-numeric` | **故障 A**：`articleId`/`briefId` 无法解析为数字，原静默 return |
| `[chain] enqueueAvailableDraftSectionJobs start` | `specsCount`、`doneCount`、`activeBefore`、并行与白名单配置快照 |
| `[chain] draft_section enqueue decision` | 每段：`decision` 为 `done` / `pending_or_running` / `gated` / `enqueued` |
| `[chain] enqueueAvailableDraftSectionJobs complete` | `enqueuedCount`（为 0 且无 `skipped` 时看是否全是 `gated`） |
| `[pipeline/tick] chained pipeline enqueue failed` | **故障 C**：`payload.create` 等抛错，meta 含 `chainStep` |
| `[pipeline/tick] draft_skeleton chain: enqueueDraftSectionsAfterSkeleton completed` | `runChainedEnqueue` 未抛错（不代表一定入队了 section） |

将上述若干行复制保存，便于对比根因。

## Phase 3 — 根因对照与后续修复（另开 PR / plan 实施代码）

| 代号 | 典型信号 | 修复方向（概要） |
|------|----------|------------------|
| **A** | `skipped: article/brief id non-numeric`；或 tick 里 `articleIdFromOutput` 为空 / 非数字 | `tick` 对 `articleId` 增加 `articleIdFromJob(doc)` fallback；必要时在 skeleton 任务上回填 `article` 关联 |
| **B** | 多条 `decision: gated`，`enqueuedCount: 0` | 调整 Pipeline Settings（并行度、清空白名单或加入 `custom` 等） |
| **C** | `chained pipeline enqueue failed` + 堆栈 | 按 FK / tenant / 字段错误修 workflow-jobs 写入条件 |
| **D** | `specsCount: 0`（极少见，outline 与 fallback 均应非空） | 核查 brief 数据损坏或 `loadBriefSectionSpecs` 读库失败 |

具体代码修改不在本诊断 PR 范围内；锁定代号后再开最小修复变更。
