import {
  AMZ_DESIGN_FILLABLE_DOT_PATHS,
  buildFlatFillSkeletonPlaceholderJson,
} from '@/utilities/amzTemplateDesign/amzDesignFillablePaths'
import { buildSystemPrompt } from '@/utilities/amzTemplateDesign/runAmzTemplateDesignForSite'
import {
  ALERT_EVAL_SYSTEM,
  ALERT_EVAL_USER,
  AMZ_TEMPLATE_DESIGN_FILL_SYSTEM,
  AMZ_TEMPLATE_DESIGN_FILL_USER,
  AMZ_TEMPLATE_DESIGN_MERGE_SYSTEM,
  AMZ_TEMPLATE_DESIGN_MERGE_USER,
  COMPETITOR_GAP_SYSTEM,
  COMPETITOR_GAP_USER,
  DOMAIN_AUDIT_SYSTEM,
  DOMAIN_AUDIT_USER,
  DRAFT_SECTION_SYSTEM,
  DRAFT_SECTION_USER,
  FINALIZE_COHESION_SYSTEM,
  FINALIZE_COHESION_USER,
  FINALIZE_EEAT_SYSTEM,
  FINALIZE_EEAT_USER,
  FINALIZE_FACT_CHECK_SYSTEM,
  FINALIZE_FACT_CHECK_USER,
  OFFER_REVIEW_MDX_SYSTEM,
  OFFER_REVIEW_MDX_USER,
  SERP_BRIEF_SYSTEM,
  SERP_BRIEF_USER,
  type OpenRouterTenantPipelinePromptKey,
} from '@/utilities/domainGeneration/promptKeys'
import { substitutePromptPlaceholders } from '@/utilities/domainGeneration/substitutePromptPlaceholders'

import { SERP_BRIEF_SYSTEM_ADDON } from '@/utilities/openRouterTenantPrompts/serpBriefConstants'

/** Matches `skillPrompts` SEED (migration + template default). Runtime may use `getSkillPrompt` which can diverge. */
export const DEFAULT_SKILL_DOMAIN_AUTHORITY_AUDITOR_SYSTEM =
  'You score CITE 40 and vetoes T03/T05/T09.'

export const DEFAULT_SKILL_ALERT_MANAGER_SYSTEM = 'You turn metric deltas into alerts and severity.'

export const DEFAULT_SKILL_COMPETITOR_ANALYSIS_SYSTEM = 'You compare competitor H2 structure and list gaps.'

export const DEFAULT_SKILL_SEO_CONTENT_WRITER_SYSTEM =
  'You are an SEO copywriter. Follow H1, intro, H2-H3 structure, FAQ, and CORE-EEAT constraints. Do not fabricate first-hand test data.'

/** System = memory block + addon; `memory_block` is runtime `appendMemoryBlock('serp-analysis', rows)`. */
export const DEFAULT_SERP_BRIEF_SYSTEM_TEMPLATE = '{{memory_block}}\n\n{{serp_brief_addon}}'

export const DEFAULT_SERP_BRIEF_USER_TEMPLATE = [
  'Target keyword: {{term}}',
  '',
  '{{serp_user_block}}',
  '',
  'Tavily-style research summary (truncated JSON): {{tavily_slice}}',
  '',
  'Return a cohesive content brief: angle, reader job-to-be-done, sections (H2-level), FAQs if useful for snippets, differentiation vs the listed organic URLs.',
].join('\n')

export function buildSerpBriefPromptDefaults(vars: {
  memory_block: string
  serp_user_block: string
  tavily_slice: string
  term: string
}): { system: string; user: string } {
  const v = {
    ...vars,
    serp_brief_addon: SERP_BRIEF_SYSTEM_ADDON,
  }
  return {
    system: substitutePromptPlaceholders(DEFAULT_SERP_BRIEF_SYSTEM_TEMPLATE, v),
    user: substitutePromptPlaceholders(DEFAULT_SERP_BRIEF_USER_TEMPLATE, {
      term: vars.term,
      serp_user_block: vars.serp_user_block,
      tavily_slice: vars.tavily_slice,
    }),
  }
}

export const DEFAULT_DRAFT_SECTION_USER_TEMPLATE = [
  'sectionId: {{section_id}}',
  '',
  'sectionType: {{section_type}}{{previous_section_block}}',
  '',
  'context:',
  '{{global_context}}{{research_slice_block}}',
].join('\n')

export function buildDraftSectionPromptDefaults(args: {
  sectionId: string
  sectionType: string
  previousSectionSummary?: string
  globalContext: string
  defaultSystem: string
  researchSlice?: string
}): { system: string; user: string } {
  const previous_section_block =
    args.previousSectionSummary && args.previousSectionSummary.trim() ?
      `\n\nprevious: ${args.previousSectionSummary.trim()}`
    : ''
  const research_slice_block =
    args.researchSlice && args.researchSlice.trim() ?
      `\n\nper-section research (truncated):\n${args.researchSlice.trim()}`
    : ''
  const vars = {
    section_id: args.sectionId,
    section_type: args.sectionType,
    previous_section_block,
    global_context: args.globalContext,
    research_slice_block,
  }
  return {
    system: args.defaultSystem,
    user: substitutePromptPlaceholders(DEFAULT_DRAFT_SECTION_USER_TEMPLATE, vars),
  }
}

export const DEFAULT_FINALIZE_COHESION_SYSTEM =
  'You are an SEO editor merging parallel-written sections into one cohesive article. Preserve facts; smooth transitions and remove duplicated H2 intros. Output MARKDOWN ONLY: ## for H2, ### for H3. English. No preamble or meta-commentary.'
export const DEFAULT_FINALIZE_COHESION_USER_TEMPLATE =
  'Current draft as plain text (may have rough jumps between sections):\n---\n{{article_plain}}\n---\nRewrite into cohesive markdown with consistent voice.'

export const DEFAULT_FINALIZE_EEAT_SYSTEM =
  'Polish English article markdown for EEAT clarity: specificity, disclaimers where needed, tighten hedging vs overclaiming; keep headings. Output MARKDOWN only — no preamble.'
export const DEFAULT_FINALIZE_EEAT_USER_TEMPLATE =
  'Article markdown:\n---\n{{article_md}}\n---\nReturn improved markdown only.'

export const DEFAULT_FINALIZE_FACT_SYSTEM =
  'You verify web research vs an article excerpt. Produce a SHORT markdown appendix "## Verification snapshot" with up to 6 bullets: each bullet states claim + whether supported / uncertain based on Tavily JSON. Avoid inventing citations beyond the snippet. Output markdown only.'
export const DEFAULT_FINALIZE_FACT_USER_TEMPLATE =
  'Article excerpt:\n{{article_plain}}\n\nTavily research JSON (truncated):\n{{tavily_slice}}'

export function buildFinalizeCohesionDefaults(vars: {
  article_plain: string
}): { system: string; user: string } {
  return {
    system: DEFAULT_FINALIZE_COHESION_SYSTEM,
    user: substitutePromptPlaceholders(DEFAULT_FINALIZE_COHESION_USER_TEMPLATE, vars),
  }
}

export function buildFinalizeEeatDefaults(vars: { article_md: string }): { system: string; user: string } {
  return {
    system: DEFAULT_FINALIZE_EEAT_SYSTEM,
    user: substitutePromptPlaceholders(DEFAULT_FINALIZE_EEAT_USER_TEMPLATE, vars),
  }
}

export function buildFinalizeFactCheckDefaults(vars: {
  article_plain: string
  tavily_slice: string
}): { system: string; user: string } {
  return {
    system: DEFAULT_FINALIZE_FACT_SYSTEM,
    user: substitutePromptPlaceholders(DEFAULT_FINALIZE_FACT_USER_TEMPLATE, vars),
  }
}

export const DEFAULT_DOMAIN_AUDIT_USER_TEMPLATE = 'URL: {{page_url}}\nExcerpt: {{html_excerpt}}'

export const DEFAULT_ALERT_EVAL_USER_TEMPLATE = '{{metrics_json}}'

export const DEFAULT_COMPETITOR_GAP_USER_TEMPLATE =
  'Topic: {{topic}}\nCompetitor URLs: {{competitor_urls}}'

export const DEFAULT_OFFER_REVIEW_MDX_SYSTEM =
  'You are an expert Amazon affiliate review writer and SEO editor. Output only valid MDX with YAML frontmatter. Generate concise, high-CTR, feature-driven titles. Never output LLM control tokens such as <bos>, <eos>, or arbitrary bracket-only markers.'

export const DEFAULT_OFFER_REVIEW_MDX_USER_TEMPLATE = [
  'Write a complete MDX review using the template style below.',
  'Requirements:',
  '- Output ONLY MDX. No code fences.',
  '- Do not output LLM control tokens such as <bos>, <eos>, or <|...|>-style markers.',
  '- Keep the same section structure and tone as the template.',
  '- **Body must use Markdown only** (headings, lists, bold, links) — **no JSX or HTML tags** in the body.',
  '- Frontmatter fields must include: title, date, description, asin, brand, category, rating, image, amazonUrl, pros, cons.',
  '- Use the provided data. Do NOT change asin or amazonUrl.',
  '- Use date: {{date}}',
  '',
  'SEO title rules (very important):',
  '- Generate a NEW SEO title based on product features/benefits, not by copying the raw Amazon title.',
  '- Title should be concise: 8-14 words, ideally <= 85 characters.',
  '- Put the main keyword early, include one clear differentiator.',
  '- Avoid keyword stuffing, avoid full ALL CAPS.',
  '',
  'H1 heading rules:',
  '- The first markdown H1 (# ...) must be short and readable (<= 90 characters).',
  '- H1 should match or lightly expand frontmatter title.',
  '',
  'Template MDX (style reference):',
  '{{template_mdx}}',
  '',
  'Product data (source of truth):',
  'raw_product_title: {{raw_product_title}}',
  'asin: {{asin}}',
  'brand: {{brand}}',
  'category: {{category}}',
  'rating: {{rating}}',
  'image: {{image}}',
  'amazonUrl: {{amazon_url}}',
  'key_features: {{key_features}}',
  '',
  'If brand/category/description is missing, infer briefly from title/features.',
].join('\n')

export function buildOfferReviewMdxPromptVars(args: {
  templateMdx: string
  date: string
  raw_product_title: string
  asin: string
  brand: string
  category: string
  rating: string
  image: string
  amazon_url: string
  key_features: string
}): Record<string, string> {
  return {
    template_mdx: args.templateMdx,
    date: args.date,
    raw_product_title: args.raw_product_title,
    asin: args.asin,
    brand: args.brand,
    category: args.category,
    rating: args.rating,
    image: args.image,
    amazon_url: args.amazon_url,
    key_features: args.key_features,
  }
}

export function buildOfferReviewMdxPromptDefaults(
  vars: ReturnType<typeof buildOfferReviewMdxPromptVars>,
): { system: string; user: string } {
  return {
    system: DEFAULT_OFFER_REVIEW_MDX_SYSTEM,
    user: substitutePromptPlaceholders(DEFAULT_OFFER_REVIEW_MDX_USER_TEMPLATE, vars),
  }
}

export const DEFAULT_AMZ_TEMPLATE_DESIGN_MERGE_SYSTEM = buildSystemPrompt(false)
export const DEFAULT_AMZ_TEMPLATE_DESIGN_FILL_SYSTEM = buildSystemPrompt(true)

export const DEFAULT_AMZ_TEMPLATE_DESIGN_MERGE_USER_TEMPLATE = [
  'Main product: {{main_product}}',
  'Canonical site_name: {{canonical_site_name}}',
  'Canonical site_domain: {{canonical_site_domain}}',
  '',
  'Niche data: {{niche_json}}',
  '',
  'Current merged siteConfig (JSON):\n{{current_config_json}}',
  '',
  'Produce the JSON patch/object to merge. Respect locked lists (omit navigation.main, footer.resources, footer.legal, homepage.categories.items, pages.guides.categories). English copy only.',
  'For brand.logo: use type "lucide" unless providing a deliberate raster logo; set icon to one specific PascalCase Lucide name that reflects the niche and Main product stated above.',
].join('\n')

const AMZ_FILL_PATHS_BLOCK = AMZ_DESIGN_FILLABLE_DOT_PATHS.join('\n')
const AMZ_FILL_SKELETON_JSON = JSON.stringify(buildFlatFillSkeletonPlaceholderJson(), null, 2)

export const DEFAULT_AMZ_TEMPLATE_DESIGN_FILL_USER_TEMPLATE = [
  'Mode: FILL-SLOTS (English copy only on whitelisted paths).',
  'Main product: {{main_product}}',
  'Canonical site_name: {{canonical_site_name}}',
  'Canonical site_domain: {{canonical_site_domain}}',
  'variation_seed: {{variation_seed}}',
  '',
  'Niche data: {{niche_json}}',
  '',
  'Fill every field below. Output one flat JSON object: keys must be exactly these dot-paths, values real English strings (no __FILL_EN__).',
  'Do not send the full siteConfig; do not nest objects at the top level.',
  '',
  'Allowed dot-path keys (' + String(AMZ_DESIGN_FILLABLE_DOT_PATHS.length) + '):',
  '{{dot_paths_block}}',
  '',
  'Shape reference (values are placeholders only):',
  '{{skeleton_json}}',
].join('\n')

export function buildAmzTemplateDesignMergePromptVars(args: {
  mainProduct: string
  canonicalSiteName: string
  canonicalSiteDomain: string
  nicheJson: string
  currentConfigJson: string
}): Record<string, string> {
  return {
    main_product: args.mainProduct,
    canonical_site_name: args.canonicalSiteName || '(empty)',
    canonical_site_domain: args.canonicalSiteDomain || '(empty)',
    niche_json: args.nicheJson,
    current_config_json: args.currentConfigJson,
  }
}

export function buildAmzTemplateDesignFillPromptVars(args: {
  mainProduct: string
  canonicalSiteName: string
  canonicalSiteDomain: string
  nicheJson: string
  variationSeed: string
}): Record<string, string> {
  return {
    main_product: args.mainProduct,
    canonical_site_name: args.canonicalSiteName || '(empty)',
    canonical_site_domain: args.canonicalSiteDomain || '(empty)',
    niche_json: args.nicheJson,
    variation_seed: args.variationSeed,
    dot_paths_block: AMZ_FILL_PATHS_BLOCK,
    skeleton_json: AMZ_FILL_SKELETON_JSON,
  }
}

export function buildAmzTemplateDesignMergePromptDefaults(
  args: Parameters<typeof buildAmzTemplateDesignMergePromptVars>[0],
): { system: string; user: string } {
  const vars = buildAmzTemplateDesignMergePromptVars(args)
  return {
    system: DEFAULT_AMZ_TEMPLATE_DESIGN_MERGE_SYSTEM,
    user: substitutePromptPlaceholders(DEFAULT_AMZ_TEMPLATE_DESIGN_MERGE_USER_TEMPLATE, vars),
  }
}

export function buildAmzTemplateDesignFillPromptDefaults(
  args: Parameters<typeof buildAmzTemplateDesignFillPromptVars>[0],
): { system: string; user: string } {
  const vars = buildAmzTemplateDesignFillPromptVars(args)
  return {
    system: DEFAULT_AMZ_TEMPLATE_DESIGN_FILL_SYSTEM,
    user: substitutePromptPlaceholders(DEFAULT_AMZ_TEMPLATE_DESIGN_FILL_USER_TEMPLATE, vars),
  }
}

/** Idempotent migration bodies (literal defaults / templates). */
export const DEFAULT_OPENROUTER_TENANT_PROMPT_SEED_BODIES: Record<
  OpenRouterTenantPipelinePromptKey,
  string
> = {
  [SERP_BRIEF_SYSTEM]: DEFAULT_SERP_BRIEF_SYSTEM_TEMPLATE,
  [SERP_BRIEF_USER]: DEFAULT_SERP_BRIEF_USER_TEMPLATE,
  [DRAFT_SECTION_SYSTEM]: DEFAULT_SKILL_SEO_CONTENT_WRITER_SYSTEM,
  [DRAFT_SECTION_USER]: DEFAULT_DRAFT_SECTION_USER_TEMPLATE,
  [FINALIZE_COHESION_SYSTEM]: DEFAULT_FINALIZE_COHESION_SYSTEM,
  [FINALIZE_COHESION_USER]: DEFAULT_FINALIZE_COHESION_USER_TEMPLATE,
  [FINALIZE_EEAT_SYSTEM]: DEFAULT_FINALIZE_EEAT_SYSTEM,
  [FINALIZE_EEAT_USER]: DEFAULT_FINALIZE_EEAT_USER_TEMPLATE,
  [FINALIZE_FACT_CHECK_SYSTEM]: DEFAULT_FINALIZE_FACT_SYSTEM,
  [FINALIZE_FACT_CHECK_USER]: DEFAULT_FINALIZE_FACT_USER_TEMPLATE,
  [DOMAIN_AUDIT_SYSTEM]: DEFAULT_SKILL_DOMAIN_AUTHORITY_AUDITOR_SYSTEM,
  [DOMAIN_AUDIT_USER]: DEFAULT_DOMAIN_AUDIT_USER_TEMPLATE,
  [ALERT_EVAL_SYSTEM]: DEFAULT_SKILL_ALERT_MANAGER_SYSTEM,
  [ALERT_EVAL_USER]: DEFAULT_ALERT_EVAL_USER_TEMPLATE,
  [COMPETITOR_GAP_SYSTEM]: DEFAULT_SKILL_COMPETITOR_ANALYSIS_SYSTEM,
  [COMPETITOR_GAP_USER]: DEFAULT_COMPETITOR_GAP_USER_TEMPLATE,
  [OFFER_REVIEW_MDX_SYSTEM]: DEFAULT_OFFER_REVIEW_MDX_SYSTEM,
  [OFFER_REVIEW_MDX_USER]: DEFAULT_OFFER_REVIEW_MDX_USER_TEMPLATE,
  [AMZ_TEMPLATE_DESIGN_MERGE_SYSTEM]: DEFAULT_AMZ_TEMPLATE_DESIGN_MERGE_SYSTEM,
  [AMZ_TEMPLATE_DESIGN_MERGE_USER]: DEFAULT_AMZ_TEMPLATE_DESIGN_MERGE_USER_TEMPLATE,
  [AMZ_TEMPLATE_DESIGN_FILL_SYSTEM]: DEFAULT_AMZ_TEMPLATE_DESIGN_FILL_SYSTEM,
  [AMZ_TEMPLATE_DESIGN_FILL_USER]: DEFAULT_AMZ_TEMPLATE_DESIGN_FILL_USER_TEMPLATE,
}
