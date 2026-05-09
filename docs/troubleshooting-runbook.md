# 运维排查速查（OpenRouter / Node 警告 / 写作流水线）

先按**当前最痛的症状**选路线；三条线索**不要混为同一根因**。

| 症状 | 路线 |
|------|------|
| 终端 / 日志里 `[openRouter] Failed to fetch OpenRouter model list` | [线索 A — OpenRouter 模型列表](#线索-a--openrouter-模型列表) |
| `MaxListenersExceededWarning`（WriteStream） | [线索 B — Node 开发警告](#线索-b--maxlistenersexceededwarning) |
| 正文只有 `<!-- section:* -->`、`enqueuedCount: 0`、`doneCount` 已满 | [线索 C — 写作流水线「假完成」](#线索-c--写作流水线假完成) |

详见写作链专用日志说明：[writing-pipeline-chain-debug.md](./writing-pipeline-chain-debug.md)。

---

## 线索 A — OpenRouter 模型列表

**作用**：仅在 `OPENAI_BASE_URL` **包含** `openrouter` 且配置了 `OPENAI_API_KEY` 时，启动阶段请求 `https://openrouter.ai/api/v1/models`，用于填充 Admin 里 **Payload AI 模型下拉**。失败时 **不致命**：回退到插件默认列表，服务仍可启动。

**代码**：[openRouterGenerationModels.ts](../src/utilities/openRouterGenerationModels.ts)（[`payload.config.ts`](../src/payload.config.ts) 初始化时调用）。

**核对**：

1. `.env` / Cloudflare `vars`：`OPENAI_BASE_URL` 是否指向 OpenRouter；`OPENAI_API_KEY` 是否为 OpenRouter key。
2. 超时默认 **8s**。网络慢时可设 **`OPENROUTER_MODEL_LIST_TIMEOUT_MS`**（毫秒，范围 **1000–120000**），例如 `20000`。
3. 在同一环境手工测（勿提交真实 key）：
   ```bash
   curl -sS -o /dev/null -w '%{time_total}\n' \
     -H "Authorization: Bearer $OPENAI_API_KEY" \
     https://openrouter.ai/api/v1/models
   ```
   若经常 **大于** 你配置的超时，会看到 `TimeoutError`；拉高 `OPENROUTER_MODEL_LIST_TIMEOUT_MS` 或改善网络。

**与 Git / GitHub**：无关；改环境变量或部署区域后行为可能变化，但 **push 本身不修复网络**。

---

## 线索 B — `MaxListenersExceededWarning`

**含义**：Node 认为 **stdout/stderr** 上同一类监听器过多。**常见于 `pnpm dev` / Next HMR**。

**核对**：

1. 运行 **`pnpm build && pnpm start`**（或线上 Worker）。若 **仅 dev 出现**：一般可忽略。
2. 若 **生产**仍有：再排查是否有自定义 logger、子进程反复挂 `process.stdout`（本仓库未集中使用 `setMaxListeners`）。

---

## 线索 C — 写作流水线「假完成」

**典型**：日志里 `doneCount` 已等于大纲节数，但正文仍只有骨架注释；`enqueuedCount: 0`。

**原因**：`successfulDraftSectionIds` 会把 **`draft_section` + `completed` + `output.ok !== false`** 且 **合并结果已体现在文章上** 的小节算作已写完（依据 `articles.sectionSummaries[sectionId]` 的 `writtenAt`/`hash`、`output.written === true`、或正文中已不再存在该节的 `<!-- section:id -->` 骨架占位）。仅任务「假完成」、正文仍为骨架的，**不再**算作 done，流水线会再次入队 `draft_section`。与 OpenRouter / Together 无必然关系。

**核对**：

1. Admin → **Workflow Jobs**：`article = <目标文章>`、`jobType = draft_section`，打开 **completed** 记录的 **`output`**，对照正文是否真的写入。
2. **假完成**：删除/修正这些任务（或把 `output.ok` 标为失败）后，再 **[pipeline-catchup](../src/app/(payload)/api/admin/articles/[id]/pipeline-catchup/route.ts)**（文章需有 `sourceBrief`），或按 [writing-pipeline-chain-debug.md](./writing-pipeline-chain-debug.md) 查 `[chain]`。
3. **Together**：关闭 `togetherImageEnabled` 可避免 `image_generate` 拖死 batch；见 [writing-pipeline-chain-debug.md](./writing-pipeline-chain-debug.md) 中「Together 配图与写作 batch」小节。

---

## 建议顺序（再确认）

1. 选对线索表中的 **一行**，按该节做核对。
2. 写作问题优先看 **workflow-jobs 数据** 与 **`[chain]`**，不要先用「换网络 / 重 deploy」代替数据核查。
