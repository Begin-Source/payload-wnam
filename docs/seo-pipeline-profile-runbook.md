# SEO 流水线方案新建复现手册

本文记录如何新增一套“不同角度”的 SEO / AI 内容流水线方案，并让运营能在 Admin 里独立编辑该方案的提示词。

适用对象：

- Admin 集合：`SEO 流水线方案`（`pipeline-profiles`）
- Admin 集合：`租户提示词模板`（`tenant-prompt-templates`）
- 全局兜底：`全局 SEO 流水线`（`pipeline-settings`）

## 1. 先定义方案角度

每套方案必须有清晰假设，避免只是复制旧方案改名字。

常见角度：

- 转化质量线：商业 / 交易意图，深检索，EEAT finalize，80+ 质量门槛。
- GEO 引用线：AI Overview / LLM citation，答案型结构，实体定义，方法论，FAQ，fact-check finalize。
- 新鲜度规模线：趋势词，标准 brief，并行章节，fact-check，较高吞吐。
- 权威评测线：review / comparison，逐章调研，强 disclosure，强 spec / evidence table。

命名建议：

- `name` 用中文给运营看，并写出推荐关键词策略，例如 `SEO 方案 · GEO 引用 80+（推荐关键词：GEO 引用选词）`。
- `slug` 用稳定英文，例如 `geo-citation-quality-80-v1`。
- `description` 写清楚方案假设、适用内容类型和质量门槛。

## 2. 新建 pipeline profile

推荐用 migration 固定写入，便于以后复现到本地 / 远端环境。

参考文件：

- `src/migrations/20260823_120000_seed_publish_quality_80_pipeline_profile.ts`
- `src/migrations/20260514_120000_seed_geo_citation_quality_80_pipeline_profile.ts`

关键字段：

- `tavilyEnabled`: 是否启用 Tavily 调研。
- `dataForSeoEnabled`: 是否启用 DataForSEO / SERP 数据。
- `defaultLlmModel`: 默认 OpenRouter 模型。
- `briefDepth`: `quick` / `standard` / `deep`。
- `briefVariant`: 常用 `dfs_serp_first`。
- `skeletonVariant`: `top10_blend` 或 `cluster_driven`。
- `sectionVariant`: 常用 `research_per_section`。
- `finalizeVariant`: `eeat_rewrite_pass` 或 `fact_check_pass`。
- `amzKeywordEligibility`: 关键词资格 JSON。
- `articleStrategy.seoWorkflow`: 注入写作提示词的运行时策略块。
- `articleStrategy.contentQualityGate`: `/api/pipeline/content-audit` 使用的发布质量门槛。

80+ 门槛建议写法：

```json
{
  "contentQualityGate": {
    "minOverallScore": 80,
    "minWords": 2200,
    "minH2Count": 9,
    "minH3Count": 5,
    "requireFaqSection": true,
    "requireChecklistSection": true,
    "disallowBodyH1": true,
    "publishIfPass": true,
    "hardVetoCodes": ["T04", "C01", "R10"],
    "onFail": "keep_draft"
  }
}
```

## 3. 给方案复制可编辑提示词模板

`pipeline-profiles` 只管参数；大段 System / User prompt 在 `tenant-prompt-templates`。

运行时解析顺序：

1. 先找 `tenant + key + pipelineProfile` 的专属模板。
2. 找不到则回退到 `tenant + key + pipelineProfile = null` 的租户全局模板。
3. 再找不到则用代码内置默认模板。

如果希望 Admin 里能直接编辑某套方案的提示词，需要把全局模板复制一份并绑定到该方案。

示例 SQL：把基源科技租户的全局模板复制到两套 80+ 方案。

```sql
INSERT INTO tenant_prompt_templates (
  tenant_id,
  key,
  body,
  pipeline_profile_id,
  updated_at,
  created_at
)
SELECT
  src.tenant_id,
  src.key,
  src.body,
  pp.id,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM tenant_prompt_templates src
JOIN pipeline_profiles pp
  ON pp.tenant_id = src.tenant_id
 AND pp.slug IN ('publish-quality-80-v1', 'geo-citation-quality-80-v1')
WHERE src.tenant_id = 1
  AND src.pipeline_profile_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM tenant_prompt_templates existing
    WHERE existing.tenant_id = src.tenant_id
      AND existing.key = src.key
      AND existing.pipeline_profile_id = pp.id
  );
```

Admin 操作路径：

- 打开 `租户提示词模板`。
- Filter：`限定 SEO 流水线方案（可选） equals 目标方案`。
- 编辑对应 key 的 body。

## 3.1. 给流水线名称写上推荐关键词策略

建议把“推荐关键词策略”写进 `pipeline-profiles.name` 和 `description`，员工在 SEO 流水线列表里就能直接看到应该搭配哪套选词。

推荐命名：

- `SEO 方案 · 标准 Brief（推荐关键词：默认机会分）`
- `SEO 方案 · 发布质量 80+（推荐关键词：Quick-win 商业词）`
- `SEO 方案 · GEO 引用 80+（推荐关键词：GEO 引用选词）`

对应关键词排产预设：

- `默认机会分（推荐：标准Brief）`：`batchMode=default`，active 优先、无 active 则 draft，按 `opportunityScore` 降序，适合通用内容生产和轻量测试。
- `Quick-win 商业词（推荐：发布质量80+）`：`batchMode=quick_wins`，`eligibleOnly=true`，`intentWhitelist=commercial, transactional`，适合转化型文章。
- `高价值类目词（推荐：发布质量80+）`：`batchMode=high_commission_affiliate`，`eligibleOnly=true`，商业/交易意图，`volume >= 150`，`KD <= 45`，词面命中 home/kitchen/tools/outdoor/pet/beauty/electronics 等 Amazon affiliate 高价值类目；真实优先级应逐步改为佣金率 × 客单价配置表驱动，适合 best/review/listicle money content。
- `对比决策词（推荐：发布质量80+）`：`batchMode=comparison_decision`，不强制 `eligible=true`，商业/交易意图，`volume >= 50`，`KD <= 55`，词面命中 vs/review/alternatives/worth it/best under 等购买决策修饰词，适合 comparison、alternative、review、buyer guide。
- `GEO 引用选词（推荐：GEO引用80+）`：`batchMode=geo_friendly`，`geoIntentWhitelist=informational, commercial`，适合问答、定义、比较、方法论、AI citation 内容。

## 3.2. Amazon affiliate 推荐操作流

当前业务不是自有品牌站，而是通过 Google SEO 获取 Amazon affiliate 佣金。关键词和文章流程应按“赚钱页优先，支撑页辅助，老文维护”的顺序执行。

推荐顺序：

- 第一步：用 `Quick-win 商业词`、`高价值类目词`、`对比决策词` 生产 money page，默认配 `发布质量 80+` 流水线。
- 第二步：每个 money page 周围补 2-5 篇 `GEO 引用选词` 或主题支撑文章，用内链推 money page。
- 第三步：用 `Pillar 冲刺` 把同一类目词做成 cluster，补齐主题覆盖。
- 第四步：有 Search Console 展示和排名后，用 `老文刷新词` 维护已有赚钱页。
- 第五步：`默认机会分` 只做兜底和人工不确定时的测试入口，不作为 affiliate 主策略。

排产到文章时，系统会把关键词策略写进 `workflow-jobs.input` 和 `content-briefs.sources.affiliateSeoFlow`，并自动选择文章布局：

- `quick_wins` → `commercial_hub`
- `high_commission_affiliate` → `commercial_hub`
- `comparison_decision` → `product_comparison`
- `geo_friendly` → `editorial_review`
- `default` / `pillar_sprint` / `refresh_decay` → `default`
- `seasonal` → `commercial_hub`

## 3.3. 半自动定时发布流

自动发布采用保守模式：AI 可以自动生成草稿和排队，但只有通过发布检查的文章才会定时上线。

推荐员工入口：

1. 进入 `站点启动`。
2. 选择站点。
3. 确认推荐关键词策略和 Brief 入队数量。
4. 点击 `一键启动前期内容`。
5. 等工作流跑完后，点击 `加入发布队列`。
6. 需要人工试跑时点击 `执行一次发布`；生产环境可交给定时任务。

后台可视化入口：

1. 进入 `网站 > 站点` 列表页。
2. 点击右上角 `快捷操作 · 站点`。
3. 切换到 `自动发布` tab。
4. 选择站点后，先点 `加入发布队列`，需要人工立刻试跑时再点 `执行一次定时发布`。

发布检查要求：

- `status=draft`
- 有 `author`
- `qualityScore >= 80`
- 无硬否决 veto
- affiliate surface 有披露文本
- money page（`commercial_hub` / `product_comparison`）必须有关联商品

排队 API：

```http
POST /api/admin/site-launch/schedule-publish
Content-Type: application/json

{
  "siteId": 1,
  "limit": 30,
  "minQualityScore": 80
}
```

执行定时发布：

```http
POST /api/admin/site-launch/run-scheduled-publish
Content-Type: application/json

{
  "siteId": 1,
  "limit": 20,
  "minQualityScore": 80
}
```

生产定时任务仍走 pipeline：

```http
POST /api/pipeline/cron-dispatch
Content-Type: application/json

{ "preset": "publish_tick" }
```

也可直接调用：

```http
POST /api/pipeline/scheduled-publish
Content-Type: application/json

{ "limit": 20 }
```

文章字段：

- `publishQueueStatus`: `none` / `queued` / `blocked` / `published`
- `scheduledPublishAt`: 计划发布时间
- `publishEligible`: 发布检查是否通过
- `publishBlockedReason`: 阻塞原因

## 4. 文章写作相关 key

重点关注这些 key：

- `serp_brief_system`
- `serp_brief_user`
- `draft_section_system`
- `draft_section_user`
- `finalize_cohesion_system`
- `finalize_cohesion_user`
- `finalize_eeat_system`
- `finalize_eeat_user`
- `finalize_fact_check_system`
- `finalize_fact_check_user`

不要随便删除这些占位符：

- `{{seo_workflow_block}}`
- `{{memory_block}}`
- `{{serp_brief_addon}}`
- `{{term}}`
- `{{serp_user_block}}`
- `{{tavily_slice}}`
- `{{section_id}}`
- `{{section_type}}`
- `{{previous_section_block}}`
- `{{global_context}}`
- `{{article_plain}}`
- `{{article_md}}`

其中 `{{seo_workflow_block}}` 会把 `articleStrategy.seoWorkflow` 中的目标字数、80 分门槛、H2/H3、FAQ、Checklist、brief/finalize variant 等参数注入 prompt。

## 5. 是否删除无限定提示词

无限定 `pipelineProfile = null` 的模板是租户全局默认。

可以删除“无限定的文章写作模板”，前提是每套正在使用的流水线都有自己的专属写作模板。

建议只删这些：

```sql
DELETE FROM tenant_prompt_templates
WHERE tenant_id = 1
  AND pipeline_profile_id IS NULL
  AND key IN (
    'serp_brief_system',
    'serp_brief_user',
    'draft_section_system',
    'draft_section_user',
    'finalize_cohesion_system',
    'finalize_cohesion_user',
    'finalize_eeat_system',
    'finalize_eeat_user',
    'finalize_fact_check_system',
    'finalize_fact_check_user'
  );
```

不建议删除这些非文章流程的全局模板，除非确认不需要租户默认：

- 域名生成
- 分类槽位短名
- 信任页包
- Together 生图
- Offer 评测 MDX
- AMZ 模板设计
- 域名审计 / 告警 / 竞品缺口

## 6. 删除方案前的引用检查

删除 `pipeline-profiles` 前先查引用。

```sql
SELECT
  p.id,
  p.slug,
  (SELECT COUNT(*) FROM sites s WHERE s.pipeline_profile_id = p.id) AS sites,
  (SELECT COUNT(*) FROM articles a WHERE a.pipeline_profile_id = p.id) AS articles,
  (SELECT COUNT(*) FROM tenant_prompt_templates t WHERE t.pipeline_profile_id = p.id) AS prompts,
  (SELECT COUNT(*) FROM payload_locked_documents_rels l WHERE l.pipeline_profiles_id = p.id) AS locks
FROM pipeline_profiles p
WHERE p.tenant_id = 1
ORDER BY p.id;
```

注意：

- `sites.pipeline_profile_id` 和 `articles.pipeline_profile_id` 是 `ON DELETE SET NULL`。
- `tenant_prompt_templates.pipeline_profile_id` 是 `ON DELETE CASCADE`。
- `payload_locked_documents_rels.pipeline_profiles_id` 可能阻止删除，需要先清锁。

清锁示例：

```sql
DELETE FROM payload_locked_documents_rels
WHERE pipeline_profiles_id = :profile_id;
```

## 7. 验证

检查方案是否存在：

```sql
SELECT id, tenant_id, slug, name, is_default
FROM pipeline_profiles
WHERE tenant_id = 1
ORDER BY id;
```

检查每套方案是否有专属提示词：

```sql
SELECT pp.slug, COUNT(t.id) AS prompt_count
FROM pipeline_profiles pp
LEFT JOIN tenant_prompt_templates t
  ON t.pipeline_profile_id = pp.id
WHERE pp.tenant_id = 1
GROUP BY pp.id
ORDER BY pp.id;
```

检查 80+ gate：

```sql
SELECT
  slug,
  json_extract(article_strategy, '$.seoWorkflow.workflowMode') AS workflow_mode,
  json_extract(article_strategy, '$.contentQualityGate.minOverallScore') AS min_score
FROM pipeline_profiles
WHERE tenant_id = 1;
```

## 8. 本次实际状态

基源科技当前保留三套主要方案：

- `default-opportunity-brief-v1`：`SEO 方案 · 标准 Brief（推荐关键词：默认机会分）`
- `publish-quality-80-v1`：`SEO 方案 · 发布质量 80+（推荐关键词：Quick-win 商业词）`
- `geo-citation-quality-80-v1`：`SEO 方案 · GEO 引用 80+（推荐关键词：GEO 引用选词）`

三套方案各有 35 条专属提示词模板；无限定的文章写作模板已删除，非文章流程全局模板保留 25 条。

基源科技当前推荐配对：

- 标准 Brief：`keyword-batch-presets.slug=default`
- 发布质量 80+：`keyword-batch-presets.slug=quickwin`
- 发布质量 80+：`keyword-batch-presets.slug=high-commission-affiliate`
- 发布质量 80+：`keyword-batch-presets.slug=comparison-decision`
- GEO 引用 80+：`keyword-batch-presets.slug=geo-citation-keywords`
