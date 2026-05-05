/** Keys for `tenant-prompt-templates` rows used by domain generation (audience + domain naming). */
export const DOMAIN_GEN_AUDIENCE_SYSTEM = 'domain_gen_audience_system' as const
export const DOMAIN_GEN_AUDIENCE_USER = 'domain_gen_audience_user' as const
export const DOMAIN_GEN_DOMAIN_SYSTEM = 'domain_gen_domain_system' as const
export const DOMAIN_GEN_DOMAIN_USER = 'domain_gen_domain_user' as const

export const DOMAIN_GEN_PROMPT_KEYS = [
  DOMAIN_GEN_AUDIENCE_SYSTEM,
  DOMAIN_GEN_AUDIENCE_USER,
  DOMAIN_GEN_DOMAIN_SYSTEM,
  DOMAIN_GEN_DOMAIN_USER,
] as const

export type DomainGenPromptKey = (typeof DOMAIN_GEN_PROMPT_KEYS)[number]

export const domainGenPromptKeyOptions: { label: string; value: DomainGenPromptKey }[] = [
  { label: '域名流程 · 受众 · System', value: DOMAIN_GEN_AUDIENCE_SYSTEM },
  { label: '域名流程 · 受众 · User', value: DOMAIN_GEN_AUDIENCE_USER },
  { label: '域名流程 · 域名建议 · System', value: DOMAIN_GEN_DOMAIN_SYSTEM },
  { label: '域名流程 · 域名建议 · User', value: DOMAIN_GEN_DOMAIN_USER },
]

/** Category slots · OpenRouter shortname step. */
export const CATEGORY_SLOTS_SHORTNAME_SYSTEM = 'category_slots_shortname_system' as const
export const CATEGORY_SLOTS_SHORTNAME_USER = 'category_slots_shortname_user' as const

export const CATEGORY_SLOTS_PROMPT_KEYS = [
  CATEGORY_SLOTS_SHORTNAME_SYSTEM,
  CATEGORY_SLOTS_SHORTNAME_USER,
] as const

export type CategorySlotsPromptKey = (typeof CATEGORY_SLOTS_PROMPT_KEYS)[number]

export const categorySlotsPromptKeyOptions: { label: string; value: CategorySlotsPromptKey }[] = [
  { label: '分类槽位 · 短名/候选 · System', value: CATEGORY_SLOTS_SHORTNAME_SYSTEM },
  { label: '分类槽位 · 短名/候选 · User', value: CATEGORY_SLOTS_SHORTNAME_USER },
]

/** Trust pages bundle · OpenRouter E-E-A-T five-page generation. */
export const TRUST_PAGES_BUNDLE_SYSTEM = 'trust_pages_bundle_system' as const
export const TRUST_PAGES_BUNDLE_USER = 'trust_pages_bundle_user' as const

export const TRUST_PAGES_BUNDLE_PROMPT_KEYS = [
  TRUST_PAGES_BUNDLE_SYSTEM,
  TRUST_PAGES_BUNDLE_USER,
] as const

export type TrustPagesBundlePromptKey = (typeof TRUST_PAGES_BUNDLE_PROMPT_KEYS)[number]

export const trustPagesBundlePromptKeyOptions: { label: string; value: TrustPagesBundlePromptKey }[] =
  [
    { label: '信任页包 · System', value: TRUST_PAGES_BUNDLE_SYSTEM },
    { label: '信任页包 · User', value: TRUST_PAGES_BUNDLE_USER },
  ]

/** SERP / keyword content brief (`/api/pipeline/brief-generate`). */
export const SERP_BRIEF_SYSTEM = 'serp_brief_system' as const
export const SERP_BRIEF_USER = 'serp_brief_user' as const

export const SERP_BRIEF_PROMPT_KEYS = [SERP_BRIEF_SYSTEM, SERP_BRIEF_USER] as const

export type SerpBriefPromptKey = (typeof SERP_BRIEF_PROMPT_KEYS)[number]

export const serpBriefPromptKeyOptions: { label: string; value: SerpBriefPromptKey }[] = [
  { label: 'SERP 简报 · System', value: SERP_BRIEF_SYSTEM },
  { label: 'SERP 简报 · User', value: SERP_BRIEF_USER },
]

/** Pipeline draft section (`runSectionPrompt`). */
export const DRAFT_SECTION_SYSTEM = 'draft_section_system' as const
export const DRAFT_SECTION_USER = 'draft_section_user' as const

export const DRAFT_SECTION_PROMPT_KEYS = [DRAFT_SECTION_SYSTEM, DRAFT_SECTION_USER] as const

export type DraftSectionPromptKey = (typeof DRAFT_SECTION_PROMPT_KEYS)[number]

export const draftSectionPromptKeyOptions: { label: string; value: DraftSectionPromptKey }[] = [
  { label: '草稿章节 · System', value: DRAFT_SECTION_SYSTEM },
  { label: '草稿章节 · User', value: DRAFT_SECTION_USER },
]

/** Draft finalize — cohesion after parallel sections / EEAT polish / fact-check appendix. */
export const FINALIZE_COHESION_SYSTEM = 'finalize_cohesion_system' as const
export const FINALIZE_COHESION_USER = 'finalize_cohesion_user' as const
export const FINALIZE_EEAT_SYSTEM = 'finalize_eeat_system' as const
export const FINALIZE_EEAT_USER = 'finalize_eeat_user' as const
export const FINALIZE_FACT_CHECK_SYSTEM = 'finalize_fact_check_system' as const
export const FINALIZE_FACT_CHECK_USER = 'finalize_fact_check_user' as const

export const FINALIZE_PIPELINE_PROMPT_KEYS = [
  FINALIZE_COHESION_SYSTEM,
  FINALIZE_COHESION_USER,
  FINALIZE_EEAT_SYSTEM,
  FINALIZE_EEAT_USER,
  FINALIZE_FACT_CHECK_SYSTEM,
  FINALIZE_FACT_CHECK_USER,
] as const

export type FinalizePipelinePromptKey = (typeof FINALIZE_PIPELINE_PROMPT_KEYS)[number]

export const finalizePipelinePromptKeyOptions: { label: string; value: FinalizePipelinePromptKey }[] =
  [
    { label: 'Finalize · Cohesion · System', value: FINALIZE_COHESION_SYSTEM },
    { label: 'Finalize · Cohesion · User', value: FINALIZE_COHESION_USER },
    { label: 'Finalize · EEAT · System', value: FINALIZE_EEAT_SYSTEM },
    { label: 'Finalize · EEAT · User', value: FINALIZE_EEAT_USER },
    { label: 'Finalize · Fact-check · System', value: FINALIZE_FACT_CHECK_SYSTEM },
    { label: 'Finalize · Fact-check · User', value: FINALIZE_FACT_CHECK_USER },
  ]

/** Domain audit pipeline (`/api/pipeline/domain-audit`). */
export const DOMAIN_AUDIT_SYSTEM = 'domain_audit_system' as const
export const DOMAIN_AUDIT_USER = 'domain_audit_user' as const

export const DOMAIN_AUDIT_PROMPT_KEYS = [DOMAIN_AUDIT_SYSTEM, DOMAIN_AUDIT_USER] as const

export type DomainAuditPromptKey = (typeof DOMAIN_AUDIT_PROMPT_KEYS)[number]

export const domainAuditPromptKeyOptions: { label: string; value: DomainAuditPromptKey }[] = [
  { label: '域名审计 · System', value: DOMAIN_AUDIT_SYSTEM },
  { label: '域名审计 · User', value: DOMAIN_AUDIT_USER },
]

/** Alert eval pipeline (`/api/pipeline/alert-eval`). */
export const ALERT_EVAL_SYSTEM = 'alert_eval_system' as const
export const ALERT_EVAL_USER = 'alert_eval_user' as const

export const ALERT_EVAL_PROMPT_KEYS = [ALERT_EVAL_SYSTEM, ALERT_EVAL_USER] as const

export type AlertEvalPromptKey = (typeof ALERT_EVAL_PROMPT_KEYS)[number]

export const alertEvalPromptKeyOptions: { label: string; value: AlertEvalPromptKey }[] = [
  { label: '告警评估 · System', value: ALERT_EVAL_SYSTEM },
  { label: '告警评估 · User', value: ALERT_EVAL_USER },
]

/** Competitor gap pipeline (`/api/pipeline/competitor-gap`). */
export const COMPETITOR_GAP_SYSTEM = 'competitor_gap_system' as const
export const COMPETITOR_GAP_USER = 'competitor_gap_user' as const

export const COMPETITOR_GAP_PROMPT_KEYS = [COMPETITOR_GAP_SYSTEM, COMPETITOR_GAP_USER] as const

export type CompetitorGapPromptKey = (typeof COMPETITOR_GAP_PROMPT_KEYS)[number]

export const competitorGapPromptKeyOptions: { label: string; value: CompetitorGapPromptKey }[] = [
  { label: '竞品缺口 · System', value: COMPETITOR_GAP_SYSTEM },
  { label: '竞品缺口 · User', value: COMPETITOR_GAP_USER },
]

/** Offer review MDX generation (admin). */
export const OFFER_REVIEW_MDX_SYSTEM = 'offer_review_mdx_system' as const
export const OFFER_REVIEW_MDX_USER = 'offer_review_mdx_user' as const

export const OFFER_REVIEW_MDX_PROMPT_KEYS = [OFFER_REVIEW_MDX_SYSTEM, OFFER_REVIEW_MDX_USER] as const

export type OfferReviewMdxPromptKey = (typeof OFFER_REVIEW_MDX_PROMPT_KEYS)[number]

export const offerReviewMdxPromptKeyOptions: { label: string; value: OfferReviewMdxPromptKey }[] = [
  { label: 'Offer 评测 MDX · System', value: OFFER_REVIEW_MDX_SYSTEM },
  { label: 'Offer 评测 MDX · User', value: OFFER_REVIEW_MDX_USER },
]

/** AMZ template design OpenRouter (merge vs fill-slots). */
export const AMZ_TEMPLATE_DESIGN_MERGE_SYSTEM = 'amz_template_design_merge_system' as const
export const AMZ_TEMPLATE_DESIGN_MERGE_USER = 'amz_template_design_merge_user' as const
export const AMZ_TEMPLATE_DESIGN_FILL_SYSTEM = 'amz_template_design_fill_system' as const
export const AMZ_TEMPLATE_DESIGN_FILL_USER = 'amz_template_design_fill_user' as const

export const AMZ_TEMPLATE_DESIGN_PROMPT_KEYS = [
  AMZ_TEMPLATE_DESIGN_MERGE_SYSTEM,
  AMZ_TEMPLATE_DESIGN_MERGE_USER,
  AMZ_TEMPLATE_DESIGN_FILL_SYSTEM,
  AMZ_TEMPLATE_DESIGN_FILL_USER,
] as const

export type AmzTemplateDesignPromptKey = (typeof AMZ_TEMPLATE_DESIGN_PROMPT_KEYS)[number]

export const amzTemplateDesignPromptKeyOptions: { label: string; value: AmzTemplateDesignPromptKey }[] =
  [
    { label: 'AMZ 设计 · 全量合并 · System', value: AMZ_TEMPLATE_DESIGN_MERGE_SYSTEM },
    { label: 'AMZ 设计 · 全量合并 · User', value: AMZ_TEMPLATE_DESIGN_MERGE_USER },
    { label: 'AMZ 设计 · Fill-Slots · System', value: AMZ_TEMPLATE_DESIGN_FILL_SYSTEM },
    { label: 'AMZ 设计 · Fill-Slots · User', value: AMZ_TEMPLATE_DESIGN_FILL_USER },
  ]

export const OPENROUTER_TENANT_PIPELINE_PROMPT_KEYS = [
  ...SERP_BRIEF_PROMPT_KEYS,
  ...DRAFT_SECTION_PROMPT_KEYS,
  ...FINALIZE_PIPELINE_PROMPT_KEYS,
  ...DOMAIN_AUDIT_PROMPT_KEYS,
  ...ALERT_EVAL_PROMPT_KEYS,
  ...COMPETITOR_GAP_PROMPT_KEYS,
  ...OFFER_REVIEW_MDX_PROMPT_KEYS,
  ...AMZ_TEMPLATE_DESIGN_PROMPT_KEYS,
] as const

export type OpenRouterTenantPipelinePromptKey = (typeof OPENROUTER_TENANT_PIPELINE_PROMPT_KEYS)[number]

export const openRouterTenantPipelinePromptKeyOptions: {
  label: string
  value: OpenRouterTenantPipelinePromptKey
}[] = [
  ...serpBriefPromptKeyOptions,
  ...draftSectionPromptKeyOptions,
  ...finalizePipelinePromptKeyOptions,
  ...domainAuditPromptKeyOptions,
  ...alertEvalPromptKeyOptions,
  ...competitorGapPromptKeyOptions,
  ...offerReviewMdxPromptKeyOptions,
  ...amzTemplateDesignPromptKeyOptions,
]

/** Together AI image generation (HiDream) — site / category / article featured / hero negative. */
export const TOGETHER_SITE_LOGO_PROMPT = 'together_site_logo_prompt' as const
export const TOGETHER_HERO_BANNER_PROMPT = 'together_hero_banner_prompt' as const
export const TOGETHER_HERO_BANNER_NEGATIVE = 'together_hero_banner_negative' as const
export const TOGETHER_CATEGORY_COVER_PROMPT = 'together_category_cover_prompt' as const
export const TOGETHER_ARTICLE_FEATURED_IMAGE_PROMPT = 'together_article_featured_image_prompt' as const

export const TOGETHER_IMAGE_PROMPT_KEYS = [
  TOGETHER_SITE_LOGO_PROMPT,
  TOGETHER_HERO_BANNER_PROMPT,
  TOGETHER_HERO_BANNER_NEGATIVE,
  TOGETHER_CATEGORY_COVER_PROMPT,
  TOGETHER_ARTICLE_FEATURED_IMAGE_PROMPT,
] as const

export type TogetherImagePromptKey = (typeof TOGETHER_IMAGE_PROMPT_KEYS)[number]

export const togetherImagePromptKeyOptions: { label: string; value: TogetherImagePromptKey }[] = [
  { label: 'Together · 站点 Logo 生图', value: TOGETHER_SITE_LOGO_PROMPT },
  { label: 'Together · 首页 Hero 横幅主提示', value: TOGETHER_HERO_BANNER_PROMPT },
  { label: 'Together · Hero 横幅 negative_prompt', value: TOGETHER_HERO_BANNER_NEGATIVE },
  { label: 'Together · 分类封面生图', value: TOGETHER_CATEGORY_COVER_PROMPT },
  { label: 'Together · 文章/页 Featured 配图', value: TOGETHER_ARTICLE_FEATURED_IMAGE_PROMPT },
]

export const TENANT_PROMPT_TEMPLATE_KEYS = [
  ...DOMAIN_GEN_PROMPT_KEYS,
  ...CATEGORY_SLOTS_PROMPT_KEYS,
  ...TRUST_PAGES_BUNDLE_PROMPT_KEYS,
  ...OPENROUTER_TENANT_PIPELINE_PROMPT_KEYS,
  ...TOGETHER_IMAGE_PROMPT_KEYS,
] as const

export type TenantPromptTemplateKey = (typeof TENANT_PROMPT_TEMPLATE_KEYS)[number]

export const tenantPromptTemplateKeyOptions: { label: string; value: TenantPromptTemplateKey }[] = [
  ...domainGenPromptKeyOptions,
  ...categorySlotsPromptKeyOptions,
  ...trustPagesBundlePromptKeyOptions,
  ...openRouterTenantPipelinePromptKeyOptions,
  ...togetherImagePromptKeyOptions,
]
