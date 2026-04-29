# SEO 流量矩阵 — 未完成 / 缺口清单

> 对照主计划：[seo_流量矩阵_0f995d28.plan.md](./seo_流量矩阵_0f995d28.plan.md)  
> 本清单依据计划 YAML 中 `status: in_progress` 条目与仓库当前实现差距整理，便于排期与验收。

**最近落地（代码批次）**：GitHub Actions 定时调用 `tick` / `cron-dispatch`；`siteQuotaCheck` 预算门闩 + `usageYtd` 累加；Tavily 结果 R2 7 天缓存；`rank-track` 写 `rankings`；`meta-ab-optimize` 持久化 `metaVariants`、`meta-ab-pick` 无 GSC 确定性择优并写 `meta`；`brief-generate` 注入 `knowledge-base` 摘要；内容日历「排产」API + 按钮；`pnpm run seed:linkgraph`；`dataForSeoOrganicParse` 单测。

## 基础设施与调度

- [x] **Cloudflare Cron**：OpenNext Worker 仍无 `scheduled()`；已加 `.github/workflows/pipeline-cron.yml`（hourly tick）与 `pipeline-daily.yml`（`daily_lifecycle`），`wrangler.jsonc` 注释指向该方案。若仍要边缘 Cron，需另建 Cron Worker 或等 OpenNext 支持。
- [x] **Pipeline 预算硬闸**：`siteQuotaCheck.ts` 实现 `checkPipelineSpendForJob` / `incrementSiteQuotaUsage`；`workflowJobRunner` 执行前拦截；`brief-generate` / `keyword-discover` 成功后回写用量（粗粒度估算）。
- [x] **Tavily R2 缓存**：`tavily/client.ts` 使用 R2 binding `tavily-cache/<sha256>` + 7 天 TTL（无 binding 时退化为直连 API）。
- [ ] **DataForSEO 结构**：当前为单文件 `client.ts` 通用 POST；计划中的子模块拆分（serp/keywords/labs/merchant/backlinks）、大批量 `task_post`/`task_get` 与 24h 复用策略需逐需求验收。

## 观测、GSC 与商业化数据

- [ ] **Google Search Console API**：未接入；`impressions30d`/`clicks30d`、行业 CTR 对比、ROI 看板多为占位。
- [x] **钉子 5 — Meta A/B（无 GSC 段）**：`meta-ab-optimize` 写入 `articles.metaVariants`；`meta-ab-pick` 按「文章 id + ISO 周」确定性选冠军并写 `meta.title` / `meta.description`。接 GSC CTR 后替换 `pickReason` 逻辑即可。
- [ ] **SEO Dashboard**：`seo-dashboard` 等对 billing + GSC 仍为 “Wire … placeholders”。

## 编排与契约

- [x] **钉子 1 — memory（部分）**：`brief-generate` 已 `fetchKnowledgeMemorySummaries` + `appendMemoryBlock`；其余 pipeline 路由仍需逐条接入。
- [ ] **钉子 2 — Handoff 一等结构**：`WorkflowJobs.handoff` 为 `json`，非计划中的强类型 group（六字段 + auditor 扩展 + `visitedSkills` 防循环）；下游 `recommendedNextSkill` 自动排期需与 `enqueueHandoffFollowUp` 等逐条验收。
- [x] **钉子 4 — Content Calendar 排产 UI**：`/api/admin/calendar-schedule-brief` + 日历表「排产」按钮 → 创建 `brief_generate`。
- [x] **种子脚本（部分）**：已加 `pnpm run seed:linkgraph`；`seed-automations` / `seed-blueprints` 仍缺。

## Sprint / 功能块（计划侧多为 in_progress）

- [ ] **Sprint 2 — 写稿全闭环**：三级 job、并行白名单、section 失败→`open_loop`、review 类强制 `originalEvidence ≥ 1` 等需按路由与 hook 逐项打绿（非仅文件存在）。
- [ ] **Sprint 3 — 质量与发布**：`content-quality-auditor` beforeChange 全项、schema JSON-LD 自动、sitemap/robots 增量、EEAT-D 权重注入、EEAT-F Guardrail 全量进 prompt 等需验收。
- [ ] **Sprint 4 — Amazon**：Merchant 选品→offers、模板内产品卡、周 `amazon-sync`+价格告警与业务规则需对外部 API 与 job 结果核对。
- [x] **Sprint 5 — 监控（部分）**：`rank-track` 已写入 `rankings`（含 `change` / `isAiOverviewHit` 尽力解析）并累 DFS 用量；alert-manager 周报与首次 baseline 自动化仍待接。
- [ ] **Sprint 6 — 护栏与合规 UI**：SiteQuotas 与流水线联动、Cloudflare Observability 看板、Playwright 冒烟；EEAT-C **§12.7 检查单全绿**（含 Trust 页实例化与披露组件）。
- [ ] **Sprint 7 — 生命周期 FSM**：`lifecycleStage` 等字段已有；probation/winner/borderline 等状态流与每日 triage cron 规则需与 `src/utilities/articleLifecycleTriage.ts` 对照 GSC 接入后补全。
- [ ] **Sprint 8 — 分层优化与 ROI**：meta-only / refresh / merge+301 三条线、新文发布触发 auto-internal-linking、ROI 看板（花费 vs 流量）依赖 GSC/计费数据。

## EEAT 补丁（文档级 vs 代码级）

- [ ] **EEAT A**：Authors + 文章 `author`/`reviewedBy` 与 plugin-seo Person schema 的**全路径**（尤其发布闸）验收。
- [ ] **EEAT B**：`OriginalEvidence`、水印、模板类型强制 evidence；HiDream 仅 decorative 不得充 Exp 证据——需在 draft 阶段与质量闸一致。
- [ ] **EEAT C**：`SiteBlueprints.trustAssetsTemplate`、站点级 6 张 Trust 页实例化；`AffiliateDisclosureBanner` 当前为**静态**组件，缺计划中的**三处挂载**、联盟链 `beforeRead` 强披露、与 Footer/Nav 模板联动。
- [ ] **EEAT D**：`PipelineSettings.eeatWeights` 已种子；`content-quality-auditor` 调用是否**显式**带当前 `contentType` 权重需核对。
- [ ] **EEAT E**：`eeatScoring.ts` 与 handoff 的 cap/raw/final 分数、与 knowledge-base `audit` artifact 类标记需与技能 Runbook §2 决策表一致并补单测覆盖。
- [ ] **EEAT F**：`vetoTranslations` 已存在；前台的**强制翻译层**、Guardrail Negatives 正向重释表是否**全部**进入 auditor 的 system prompt 需清单验收。

## 内链补丁 G–M

- [ ] **G**：`PageLinkGraph` + `ingest` 已有；**孤儿/入度/ money page** 等查询是否**一律以图为准**（含 pages/articles afterChange 全覆盖）需核对。
- [ ] **H**：`anchor-audit` 路由存在；**周度**汇总、R08 报告、写 `optimizationHistory` 与计划阈值（40% / 15%）需 cron + 全站统计支持。
- [ ] **I**：`topic-cluster-audit` 与 pillar↔cluster 规则、批量入 triage 需与定时任务联动。
- [ ] **J**：`mainNavTemplate` / `footerTemplate` 在 **SiteBlueprints** 中已有字段；Breadcrumb 全站组件 + BreadcrumbList JSON-LD、站点 afterChange 实例化导航/页脚/面包屑与计划**完整度**需验收。
- [ ] **K**：`internal_link_rewrite` 与 merged/archived 死稿 inlink 切换、写 `optimizationHistory`。
- [ ] **L**：月度 `internal-link-audit` 七步、四张报告落 `knowledge-base`；`ContentLifecycleBoard`「内链健康」卡片。
- [ ] **M**：`beforeValidate` 出链 80/150、条件 `internal_link_reinforce` 与 triage 联动。

## 写稿补丁 N（深度验收）

- [ ] **ContentBriefs.outline**：是否**稳定**为带 `sections[].type` / `wordBudget` / `inject` 的结构（不仅是 json 字段存在）。
- [ ] **draft_section**：`previousSectionSummary` 滑动窗、`faq`/`pros_cons` 并行、`sectionParallelism` 与重试、父 job `failed_partial` 与 `knowledge-base open_loop` 等需按 `PipelineSettings` 与实现对照。
- [ ] **draft_finalize**：内链占位回填与 **PageLinkGraph**、质量闸交接一致。

## 钉子 6 / 7

- [ ] **钉子 6**：`webfetch/robots` + `sanitize` 是否在**所有**需抓取流水线路径前强制执行；R2 缓存 24h 为 plan 要求，需核对 `robots` 实现。
- [ ] **钉子 7**：首次 rank-track → alert 基线；**月度** `backlink-scan` + `domain-audit` 落 `knowledge-base` entryType=audit 的自动化与手测。

---

**说明**：主计划文件 `seo_流量矩阵_0f995d28.plan.md` 请勿随意改写；本清单可随迭代增删勾选项。
