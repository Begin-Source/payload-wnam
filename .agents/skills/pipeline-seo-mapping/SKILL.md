---
name: pipeline-seo-mapping
description: 'Map SEO skill outputs to Payload pipeline-profiles (per-tenant A/B) or explain global pipeline-settings. Use after keyword-research / on-page / content-gap skills when the user wants to persist SEO strategy in the runtime pipeline.'
version: "1.0.0"
license: Project
compatibility: "Cursor"
when_to_use: "After running SEO skills (keyword research, on-page audit, content gap) when the user asks to apply results to the Content/DFS/draft pipeline, configure pipeline-profiles, AMZ eligibility, or model experiments."
metadata:
  tags:
    - seo
    - pipeline-profiles
    - payload
    - mcp
---

# SEO 结论 → Payload 流水线配置

仓库里 **SEO skills**（如 `keyword-research`、`on-page-seo-auditor`）只做分析与报告；**持久化**到运行时靠的是：

- 全局：Admin「SEO 流水线」`/globals/pipeline-settings`
- 按租户多套：集合 `pipeline-profiles`（[`src/collections/PipelineProfiles.ts`](../../../src/collections/PipelineProfiles.ts)），运行时与全局合并（[`src/utilities/resolvePipelineConfig.ts`](../../../src/utilities/resolvePipelineConfig.ts)）

## 何时写全局 vs profile

| 场景 | 建议 |
|------|------|
| 平台默认、所有租户共用 | 改 `pipeline-settings`（需 Admin；若启用 MCP globals 再考虑暴露） |
| 单租户对照试验、不同站点不同策略 | 新建/编辑 `pipeline-profiles`，把 `sites.pipelineProfile` 或 `articles.pipelineProfile` 指过去 |
| 仅本次 DFS 拉词覆盖 | Admin「同步拉取 · DFS」里可选流水线 profile，或 API body `pipelineProfileId` |

## 字段映射（从常见 SEO skill 产出到 profile / 全局）

以下为**覆盖项**：在 `pipeline-profiles` 里**留空表示继承全局**；只有要实验或收紧策略的字段才填。

### 关键词研究（keyword-research / 竞品词表）

- **目标关键词最小体量、KD 上限、意图聚焦** → `amzKeywordEligibility`（JSON）
  - 结构与 [`parseAmzKeywordEligibilityJson`](../../../src/utilities/keywordEligibility.ts) 一致，常用键：`intentWhitelist`（`informational` | `navigational` | `commercial` | `transactional`）、`minVolume`、`maxKd`、`minOpportunityScore`、`pullLimit`。
- **是否允许 DFS 拉词/耗配额** → `dataForSeoEnabled`（checkbox 覆盖）

### 调研 / 摘要 / 引用源（Tavily）

- **是否允许管线里用 Tavily** → `tavilyEnabled`

### 配图成本与模型（Together）

- **是否允许自动配图** → `togetherImageEnabled`
- **生图模型 ID** → `defaultImageModel`

### 写作与模型实验

- **默认 OpenRouter 模型** → `defaultLlmModel`
- **按章节不同模型** → `llmModelsBySection`（JSON 数组，项内含 `sectionType`、`model`；与 [`selectLlmModelForSection`](../../../src/utilities/pipelineSettingShape.ts) 一致）

### EEAT / 评分类结论

- **若要把审计里的权重固化为 JSON** → `eeatWeights`（以实际消费该字段的管线为准；未消费的仅作记录或后续接线）

### 规模化与稳定性

- `sectionParallelism`、`sectionMaxRetry`、`sectionParallelWhitelist`
- `frugalMode`、`amazonMarketplace`、`defaultLocale`、`defaultRegion`

## 推荐工作流（协作）

1. 先跑适用的 SEO skill，收集**可量化**建议（体量、KD、意图、是否关闭某数据源）。
2. 产出一张「建议表」：字段名 → 建议值 → 理由（实验 ID 可选）。
3. 在 Payload Admin **流水线配置**中创建或更新文档；**租户内 `slug` 唯一**；**租户默认**仅一条为 `isDefault`。
4. 将需要的 **站点** 的 `pipelineProfile` 指向该文档（或给 **文章** 指定以做篇级 A/B）。

## 用 MCP 程序化更新（可选）

若 MCP API Key 已勾选 **`pipeline-profiles`** 对应 find/update/create（见 [`src/payload.config.ts`](../../../src/payload.config.ts) 中 `mcpPlugin`），可用 MCP 工具维护文档；仍需遵守多租户权限与字段校验（如 `tenant`、`slug`）。

## 不要混淆

- **Skill 输出 ≠ 已写库**：除非显式在 Admin 或通过 MCP/API 保存，否则对话里的表格不会自动进入 D1。
- **profile 只覆盖已填字段**：未填的继续用全局 `pipeline-settings`。
