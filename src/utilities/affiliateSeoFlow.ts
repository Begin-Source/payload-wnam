export type AffiliateKeywordStrategyMode =
  | 'default'
  | 'quick_wins'
  | 'high_commission_affiliate'
  | 'comparison_decision'
  | 'geo_friendly'
  | 'pillar_sprint'
  | 'seasonal'
  | 'refresh_decay'

export type AffiliateContentRole =
  | 'money_page'
  | 'support_page'
  | 'cluster_page'
  | 'refresh_page'
  | 'fallback_page'

export type AffiliateArticleLayout =
  | 'default'
  | 'commercial_hub'
  | 'product_comparison'
  | 'editorial_review'

export type AffiliateSeoFlowPreset = {
  mode: AffiliateKeywordStrategyMode
  label: string
  contentRole: AffiliateContentRole
  articleLayout: AffiliateArticleLayout
  recommendedPipeline: 'publish-quality-80-v1' | 'geo-citation-quality-80-v1' | 'default-opportunity-brief-v1'
  operatorHint: string
}

const FLOW_PRESETS: Record<AffiliateKeywordStrategyMode, AffiliateSeoFlowPreset> = {
  quick_wins: {
    mode: 'quick_wins',
    label: '低竞争 Quick-win 商业词',
    contentRole: 'money_page',
    articleLayout: 'commercial_hub',
    recommendedPipeline: 'publish-quality-80-v1',
    operatorHint: '主力赚钱页：低 KD + 商业/交易意图，适合 best/listicle/review buyer guide。',
  },
  high_commission_affiliate: {
    mode: 'high_commission_affiliate',
    label: '高价值类目词（佣金×客单价）',
    contentRole: 'money_page',
    articleLayout: 'commercial_hub',
    recommendedPipeline: 'publish-quality-80-v1',
    operatorHint: '主力赚钱页：类目价值优先，后续应由佣金率和客单价配置表驱动，不靠大模型猜。',
  },
  comparison_decision: {
    mode: 'comparison_decision',
    label: '购买决策词（vs/review/alternative）',
    contentRole: 'money_page',
    articleLayout: 'product_comparison',
    recommendedPipeline: 'publish-quality-80-v1',
    operatorHint: '主力赚钱页：对比、替代、评测、worth-it 等购买前决策词，优先做表格和结论。',
  },
  geo_friendly: {
    mode: 'geo_friendly',
    label: '主题支撑 / GEO 引用词',
    contentRole: 'support_page',
    articleLayout: 'editorial_review',
    recommendedPipeline: 'geo-citation-quality-80-v1',
    operatorHint: '辅助页：解释、定义、FAQ、比较框架，用内链支持 money page，不作为主变现页。',
  },
  pillar_sprint: {
    mode: 'pillar_sprint',
    label: 'Pillar 簇冲刺',
    contentRole: 'cluster_page',
    articleLayout: 'default',
    recommendedPipeline: 'default-opportunity-brief-v1',
    operatorHint: '专题集群：围绕一个 pillar 补齐覆盖面和内链，不单独判断佣金价值。',
  },
  seasonal: {
    mode: 'seasonal',
    label: '季节 / 趋势赚钱词',
    contentRole: 'money_page',
    articleLayout: 'commercial_hub',
    recommendedPipeline: 'publish-quality-80-v1',
    operatorHint: '季节型赚钱页：礼物、节日、折扣、年份词，发布后需要及时刷新。',
  },
  refresh_decay: {
    mode: 'refresh_decay',
    label: '老文刷新词',
    contentRole: 'refresh_page',
    articleLayout: 'default',
    recommendedPipeline: 'default-opportunity-brief-v1',
    operatorHint: '维护收益：已有页面排名或展示衰减时刷新标题、产品、内容和内链。',
  },
  default: {
    mode: 'default',
    label: '默认机会分',
    contentRole: 'fallback_page',
    articleLayout: 'default',
    recommendedPipeline: 'default-opportunity-brief-v1',
    operatorHint: '兜底：按 opportunityScore 排序，适合测试和人工不确定时使用，不作为 affiliate 主策略。',
  },
}

export function affiliateSeoFlowForMode(raw: string | undefined | null): AffiliateSeoFlowPreset {
  if (raw != null && raw in FLOW_PRESETS) {
    return FLOW_PRESETS[raw as AffiliateKeywordStrategyMode]
  }
  return FLOW_PRESETS.default
}

export function isAffiliateArticleLayout(raw: unknown): raw is AffiliateArticleLayout {
  return raw === 'default' || raw === 'commercial_hub' || raw === 'product_comparison' || raw === 'editorial_review'
}
