/** T2 pipeline stage variant ids (aligned with Payload select values). */

export const BRIEF_VARIANTS = ['tavily_only', 'dfs_serp_first', 'competitor_mimic'] as const
export type BriefVariantId = (typeof BRIEF_VARIANTS)[number]
export const DEFAULT_BRIEF_VARIANT: BriefVariantId = 'dfs_serp_first'

export const SKELETON_VARIANTS = ['single_shot', 'top10_blend', 'cluster_driven'] as const
export type SkeletonVariantId = (typeof SKELETON_VARIANTS)[number]
export const DEFAULT_SKELETON_VARIANT: SkeletonVariantId = 'single_shot'

export const SECTION_VARIANTS = ['sequential_context', 'parallel_with_summary', 'research_per_section'] as const
export type SectionVariantId = (typeof SECTION_VARIANTS)[number]
export const DEFAULT_SECTION_VARIANT: SectionVariantId = 'sequential_context'

export const FINALIZE_VARIANTS = ['simple_merge', 'eeat_rewrite_pass', 'fact_check_pass'] as const
export type FinalizeVariantId = (typeof FINALIZE_VARIANTS)[number]
export const DEFAULT_FINALIZE_VARIANT: FinalizeVariantId = 'simple_merge'

export const BRIEF_DEPTH_LEVELS = ['quick', 'standard', 'deep'] as const
export type BriefDepthId = (typeof BRIEF_DEPTH_LEVELS)[number]
export const DEFAULT_BRIEF_DEPTH: BriefDepthId = 'standard'

export function normalizeBriefVariant(v: unknown): BriefVariantId {
  const s = typeof v === 'string' ? v.trim() : ''
  return (BRIEF_VARIANTS as readonly string[]).includes(s)
    ? (s as BriefVariantId)
    : DEFAULT_BRIEF_VARIANT
}

export function normalizeSkeletonVariant(v: unknown): SkeletonVariantId {
  const s = typeof v === 'string' ? v.trim() : ''
  return (SKELETON_VARIANTS as readonly string[]).includes(s)
    ? (s as SkeletonVariantId)
    : DEFAULT_SKELETON_VARIANT
}

export function normalizeSectionVariant(v: unknown): SectionVariantId {
  const s = typeof v === 'string' ? v.trim() : ''
  return (SECTION_VARIANTS as readonly string[]).includes(s)
    ? (s as SectionVariantId)
    : DEFAULT_SECTION_VARIANT
}

export function normalizeFinalizeVariant(v: unknown): FinalizeVariantId {
  const s = typeof v === 'string' ? v.trim() : ''
  return (FINALIZE_VARIANTS as readonly string[]).includes(s)
    ? (s as FinalizeVariantId)
    : DEFAULT_FINALIZE_VARIANT
}

export function normalizeBriefDepth(v: unknown): BriefDepthId {
  const s = typeof v === 'string' ? v.trim() : ''
  return (BRIEF_DEPTH_LEVELS as readonly string[]).includes(s) ? (s as BriefDepthId) : DEFAULT_BRIEF_DEPTH
}

export type BriefVariantConfigIn = {
  serpDepth?: number
  competitorCount?: number
}

export function parseBriefVariantConfig(raw: unknown): BriefVariantConfigIn {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const o = raw as Record<string, unknown>
  const serpDepth =
    typeof o.serpDepth === 'number' && Number.isFinite(o.serpDepth)
      ? Math.min(30, Math.max(3, Math.floor(o.serpDepth)))
      : undefined
  const competitorCount =
    typeof o.competitorCount === 'number' && Number.isFinite(o.competitorCount)
      ? Math.min(10, Math.max(1, Math.floor(o.competitorCount)))
      : undefined
  return { ...(serpDepth != null ? { serpDepth } : {}), ...(competitorCount != null ? { competitorCount } : {}) }
}

export const briefVariantFieldOptions = BRIEF_VARIANTS.map((value) => ({
  label:
    value === 'tavily_only'
      ? 'Tavily only（跳过 DFS · 长尾省费）'
      : value === 'dfs_serp_first'
        ? 'DFS SERP first + Tavily（默认 · 商业化）'
        : '竞品模拟（Top URL 对齐 · 要打竞品时用）',
  value,
}))

export const skeletonVariantFieldOptions = SKELETON_VARIANTS.map((value) => ({
  label:
    value === 'single_shot'
      ? 'Single shot（默认 · Brief 直入骨架）'
      : value === 'top10_blend'
        ? 'Top10 blend（SERP outline 汇入）'
        : 'Cluster driven（pillar 簇展开）',
  value,
}))

export const sectionVariantFieldOptions = SECTION_VARIANTS.map((value) => ({
  label:
    value === 'sequential_context'
      ? 'Sequential context（默认 · 可带前文摘要）'
      : value === 'parallel_with_summary'
        ? 'Parallel + finalize 粘合（并行写节后统一顺稿）'
        : 'Research per section（逐节 Tavily · 最重）',
  value,
}))

export const finalizeVariantFieldOptions = FINALIZE_VARIANTS.map((value) => ({
  label:
    value === 'simple_merge'
      ? 'Simple merge（默认 · Lexical 清理）'
      : value === 'eeat_rewrite_pass'
        ? 'EEAT rewrite（顺稿 + EEAT LLM）'
        : 'Fact-check（摘录事实 + Tavily 抽检）',
  value,
}))

export const briefDepthFieldOptions = BRIEF_DEPTH_LEVELS.map((value) => ({
  label:
    value === 'quick'
      ? 'Quick（类比抠门 · 最快）'
      : value === 'standard'
        ? 'Standard（默认）'
        : 'Deep（更重检索）',
  value,
}))
