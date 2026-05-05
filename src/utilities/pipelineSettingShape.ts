/**
 * Normalized pipeline knobs shared by Global `pipeline-settings` and `pipeline-profiles` overrides.
 * Field names match Payload API (camelCase).
 */
import {
  DEFAULT_BRIEF_DEPTH,
  DEFAULT_BRIEF_VARIANT,
  DEFAULT_FINALIZE_VARIANT,
  DEFAULT_SECTION_VARIANT,
  DEFAULT_SKELETON_VARIANT,
  type BriefDepthId,
  type BriefVariantId,
  type FinalizeVariantId,
  type SectionVariantId,
  type SkeletonVariantId,
  normalizeBriefDepth,
  normalizeBriefVariant,
  normalizeFinalizeVariant,
  normalizeSectionVariant,
  normalizeSkeletonVariant,
  BRIEF_DEPTH_LEVELS,
  BRIEF_VARIANTS,
  FINALIZE_VARIANTS,
  SECTION_VARIANTS,
  SKELETON_VARIANTS,
} from '@/utilities/pipelineVariants'

export type PipelineSettingShape = {
  tavilyEnabled: boolean
  dataForSeoEnabled: boolean
  togetherImageEnabled: boolean
  defaultLlmModel: string | null
  defaultImageModel: string | null
  amazonMarketplace: string | null
  defaultLocale: string | null
  defaultRegion: string | null
  frugalMode: boolean
  eeatWeights: unknown
  llmModelsBySection: unknown
  sectionParallelism: number
  sectionParallelWhitelist: unknown
  sectionMaxRetry: number
  amzKeywordEligibility: unknown
  briefVariant: BriefVariantId
  briefVariantConfig: unknown
  skeletonVariant: SkeletonVariantId
  skeletonVariantConfig: unknown
  sectionVariant: SectionVariantId
  sectionVariantConfig: unknown
  finalizeVariant: FinalizeVariantId
  finalizeVariantConfig: unknown
  /** T1 knob: TOC / CTAs / word targets JSON (partial contract). */
  articleStrategy: unknown
  briefDepth: BriefDepthId
  sectionRetryStrategy: unknown
}

/** JSON-stable snapshot for `articles.pipelineProfileSnapshot`. */
export function snapshotPipelineMerged(m: PipelineSettingShape): Record<string, unknown> {
  return JSON.parse(JSON.stringify(m)) as Record<string, unknown>
}

/** Map global row (from findGlobal) into a consistent shape. */
export function normalizeGlobalPipelineDoc(
  g: Record<string, unknown> | null | undefined,
): PipelineSettingShape {
  const d = g && typeof g === 'object' ? g : {}
  return {
    tavilyEnabled: d.tavilyEnabled !== false && d.tavilyEnabled !== 0,
    dataForSeoEnabled: d.dataForSeoEnabled !== false && d.dataForSeoEnabled !== 0,
    togetherImageEnabled: d.togetherImageEnabled !== false && d.togetherImageEnabled !== 0,
    defaultLlmModel: typeof d.defaultLlmModel === 'string' && d.defaultLlmModel.trim() ? d.defaultLlmModel.trim() : null,
    defaultImageModel:
      typeof d.defaultImageModel === 'string' && d.defaultImageModel.trim() ? d.defaultImageModel.trim() : null,
    amazonMarketplace:
      typeof d.amazonMarketplace === 'string' && d.amazonMarketplace.trim() ? d.amazonMarketplace.trim() : null,
    defaultLocale: typeof d.defaultLocale === 'string' && d.defaultLocale.trim() ? d.defaultLocale.trim() : null,
    defaultRegion: typeof d.defaultRegion === 'string' && d.defaultRegion.trim() ? d.defaultRegion.trim() : null,
    frugalMode: d.frugalMode === true || d.frugalMode === 1,
    eeatWeights: d.eeatWeights ?? null,
    llmModelsBySection: d.llmModelsBySection ?? null,
    sectionParallelism: typeof d.sectionParallelism === 'number' && Number.isFinite(d.sectionParallelism)
      ? d.sectionParallelism
      : Number(d.sectionParallelism) || 1,
    sectionParallelWhitelist: d.sectionParallelWhitelist ?? null,
    sectionMaxRetry:
      typeof d.sectionMaxRetry === 'number' && Number.isFinite(d.sectionMaxRetry)
        ? d.sectionMaxRetry
        : Number(d.sectionMaxRetry) || 3,
    amzKeywordEligibility: d.amzKeywordEligibility ?? null,
    briefVariant: normalizeBriefVariant(d.briefVariant),
    briefVariantConfig: d.briefVariantConfig ?? null,
    skeletonVariant: normalizeSkeletonVariant(d.skeletonVariant),
    skeletonVariantConfig: d.skeletonVariantConfig ?? null,
    sectionVariant: normalizeSectionVariant(d.sectionVariant),
    sectionVariantConfig: d.sectionVariantConfig ?? null,
    finalizeVariant: normalizeFinalizeVariant(d.finalizeVariant),
    finalizeVariantConfig: d.finalizeVariantConfig ?? null,
    articleStrategy: d.articleStrategy ?? null,
    briefDepth: normalizeBriefDepth(
      d.briefDepth ?? (d.frugalMode === true || d.frugalMode === 1 ? 'quick' : 'standard'),
    ),
    sectionRetryStrategy: d.sectionRetryStrategy ?? null,
  }
}

function triStateBool(v: unknown): { set: false } | { set: true; value: boolean } {
  if (v === undefined || v === null) return { set: false }
  return { set: true, value: Boolean(v === true || v === 1) }
}

function triStateString(v: unknown): { set: false } | { set: true; value: string | null } {
  if (v === undefined || v === null) return { set: false }
  if (typeof v === 'string') {
    const t = v.trim()
    return { set: true, value: t.length > 0 ? t : null }
  }
  return { set: false }
}

function triStateJson(v: unknown): { set: false } | { set: true; value: unknown } {
  if (v === undefined || v === null) return { set: false }
  return { set: true, value: v }
}

function triStateNumber(v: unknown): { set: false } | { set: true; value: number } {
  if (v === undefined || v === null) return { set: false }
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return { set: false }
  return { set: true, value: n }
}

function mergeBriefVariantProfile(
  base: BriefVariantId,
  raw: unknown,
): BriefVariantId {
  if (typeof raw !== 'string' || !raw.trim()) return base
  const v = normalizeBriefVariant(raw)
  return BRIEF_VARIANTS.includes(v) ? v : base
}

function mergeSkeletonVariantProfile(
  base: SkeletonVariantId,
  raw: unknown,
): SkeletonVariantId {
  if (typeof raw !== 'string' || !raw.trim()) return base
  const v = normalizeSkeletonVariant(raw)
  return SKELETON_VARIANTS.includes(v) ? v : base
}

function mergeSectionVariantProfile(
  base: SectionVariantId,
  raw: unknown,
): SectionVariantId {
  if (typeof raw !== 'string' || !raw.trim()) return base
  const v = normalizeSectionVariant(raw)
  return SECTION_VARIANTS.includes(v) ? v : base
}

function mergeFinalizeVariantProfile(
  base: FinalizeVariantId,
  raw: unknown,
): FinalizeVariantId {
  if (typeof raw !== 'string' || !raw.trim()) return base
  const v = normalizeFinalizeVariant(raw)
  return FINALIZE_VARIANTS.includes(v) ? v : base
}

function mergeBriefDepthProfile(base: BriefDepthId, raw: unknown): BriefDepthId {
  if (typeof raw !== 'string' || !raw.trim()) return base
  const v = normalizeBriefDepth(raw)
  return BRIEF_DEPTH_LEVELS.includes(v) ? v : base
}

/**
 * Merge profile document onto normalized global base. Profile fields only override when explicitly set.
 */
export function mergePipelineProfileOntoGlobal(
  base: PipelineSettingShape,
  profile: Record<string, unknown> | null | undefined,
): PipelineSettingShape {
  if (!profile || typeof profile !== 'object') return base
  let out = { ...base }

  const te = triStateBool(profile.tavilyEnabled)
  if (te.set) out = { ...out, tavilyEnabled: te.value }
  const de = triStateBool(profile.dataForSeoEnabled)
  if (de.set) out = { ...out, dataForSeoEnabled: de.value }
  const tie = triStateBool(profile.togetherImageEnabled)
  if (tie.set) out = { ...out, togetherImageEnabled: tie.value }
  const fm = triStateBool(profile.frugalMode)
  if (fm.set) out = { ...out, frugalMode: fm.value }

  const dlm = triStateString(profile.defaultLlmModel)
  if (dlm.set) out = { ...out, defaultLlmModel: dlm.value }
  const dim = triStateString(profile.defaultImageModel)
  if (dim.set) out = { ...out, defaultImageModel: dim.value }
  const amz = triStateString(profile.amazonMarketplace)
  if (amz.set) out = { ...out, amazonMarketplace: amz.value }
  const loc = triStateString(profile.defaultLocale)
  if (loc.set) out = { ...out, defaultLocale: loc.value }
  const reg = triStateString(profile.defaultRegion)
  if (reg.set) out = { ...out, defaultRegion: reg.value }

  const sp = triStateNumber(profile.sectionParallelism)
  if (sp.set) out = { ...out, sectionParallelism: sp.value }
  const smr = triStateNumber(profile.sectionMaxRetry)
  if (smr.set) out = { ...out, sectionMaxRetry: smr.value }

  const ew = triStateJson(profile.eeatWeights)
  if (ew.set) out = { ...out, eeatWeights: ew.value }
  const lms = triStateJson(profile.llmModelsBySection)
  if (lms.set) out = { ...out, llmModelsBySection: lms.value }
  const spw = triStateJson(profile.sectionParallelWhitelist)
  if (spw.set) out = { ...out, sectionParallelWhitelist: spw.value }
  const amzk = triStateJson(profile.amzKeywordEligibility)
  if (amzk.set) out = { ...out, amzKeywordEligibility: amzk.value }

  out = {
    ...out,
    briefVariant: mergeBriefVariantProfile(out.briefVariant, profile.briefVariant),
    skeletonVariant: mergeSkeletonVariantProfile(out.skeletonVariant, profile.skeletonVariant),
    sectionVariant: mergeSectionVariantProfile(out.sectionVariant, profile.sectionVariant),
    finalizeVariant: mergeFinalizeVariantProfile(out.finalizeVariant, profile.finalizeVariant),
    briefDepth: mergeBriefDepthProfile(out.briefDepth, profile.briefDepth),
  }

  const bvc = triStateJson(profile.briefVariantConfig)
  if (bvc.set) out = { ...out, briefVariantConfig: bvc.value }
  const svc = triStateJson(profile.skeletonVariantConfig)
  if (svc.set) out = { ...out, skeletonVariantConfig: svc.value }
  const sec = triStateJson(profile.sectionVariantConfig)
  if (sec.set) out = { ...out, sectionVariantConfig: sec.value }
  const fin = triStateJson(profile.finalizeVariantConfig)
  if (fin.set) out = { ...out, finalizeVariantConfig: fin.value }

  const art = triStateJson(profile.articleStrategy)
  if (art.set) out = { ...out, articleStrategy: art.value }
  const srs = triStateJson(profile.sectionRetryStrategy)
  if (srs.set) out = { ...out, sectionRetryStrategy: srs.value }

  return out
}

/** Effective DFS/Tavily “depth”: frugalMode OR legacy profile still wins vs briefDepth.quick. */
export function isPipelineQuickDepth(merged: PipelineSettingShape): boolean {
  if (merged.frugalMode) return true
  return merged.briefDepth === 'quick'
}

/** Pick OpenRouter model for a section from merged `llmModelsBySection` or `defaultLlmModel`. */
export function selectLlmModelForSection(
  merged: PipelineSettingShape,
  sectionType: string,
  fallback = 'openai/gpt-4o-mini',
): string {
  const list = merged.llmModelsBySection
  if (Array.isArray(list)) {
    const st = (sectionType || 'custom').trim() || 'custom'
    for (const row of list) {
      if (!row || typeof row !== 'object') continue
      const r = row as { sectionType?: string; model?: string }
      if (typeof r.sectionType !== 'string' || r.sectionType !== st) continue
      if (typeof r.model === 'string' && r.model.trim()) return r.model.trim()
    }
  }
  if (typeof merged.defaultLlmModel === 'string' && merged.defaultLlmModel.trim()) {
    return merged.defaultLlmModel.trim()
  }
  return fallback
}

/** Model for generic OpenRouter pipeline steps: frugal forces mini, else section-aware defaults. */
export function pickPipelineOpenRouterModel(merged: PipelineSettingShape, sectionType = 'custom'): string {
  if (merged.frugalMode) return 'openai/gpt-4o-mini'
  return selectLlmModelForSection(merged, sectionType)
}

/** EEAT weights keyed by content type — supports `[{ contentType, weights }]` or `{ intro: { … } }`. */
export function pickEeatWeightsForContentType(
  eeatWeights: unknown,
  sectionType: string,
): Record<string, number> | undefined {
  if (eeatWeights == null) return undefined
  const st = (sectionType || 'custom').trim() || 'custom'

  if (Array.isArray(eeatWeights)) {
    for (const row of eeatWeights) {
      if (!row || typeof row !== 'object') continue
      const r = row as { contentType?: string; weights?: Record<string, number> }
      if (typeof r.contentType !== 'string' || r.contentType.trim() !== st) continue
      if (r.weights && typeof r.weights === 'object' && !Array.isArray(r.weights)) {
        return r.weights as Record<string, number>
      }
    }
    return undefined
  }

  if (typeof eeatWeights === 'object' && !Array.isArray(eeatWeights)) {
    const o = eeatWeights as Record<string, unknown>
    const direct = o[st]
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
      return direct as Record<string, number>
    }
    const fb = o.default ?? o._default
    if (fb && typeof fb === 'object' && !Array.isArray(fb)) {
      return fb as Record<string, number>
    }
  }

  return undefined
}

/**
 * Optional word budget line from `articleStrategy` JSON for section prompts.
 */
export function wordBudgetHintFromArticleStrategy(
  articleStrategy: unknown,
  sectionType: string,
): string | undefined {
  if (articleStrategy == null || typeof articleStrategy !== 'object' || Array.isArray(articleStrategy)) return undefined
  const o = articleStrategy as Record<string, unknown>
  const byType = o.wordCountTarget
  if (byType && typeof byType === 'object' && !Array.isArray(byType)) {
    const row = (byType as Record<string, unknown>)[sectionType] ?? (byType as Record<string, unknown>).default
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      const min = (row as { min?: unknown }).min
      const max = (row as { max?: unknown }).max
      if (typeof min === 'number' && typeof max === 'number') {
        return `Target words for this section: ${min}-${max}.`
      }
    }
  }
  const flat = o.maxWordsPerSection
  if (typeof flat === 'number' && Number.isFinite(flat)) {
    return `Target words for this section: up to ~${Math.floor(flat)}.`
  }
  return undefined
}

export function pickFallbackModelFromSectionRetry(
  merged: PipelineSettingShape,
  sectionType: string,
): string | null {
  const raw = merged.sectionRetryStrategy
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const m = o.fallbackModel
  return typeof m === 'string' && m.trim() ? m.trim() : null
}

/**
 * Whether another draft_section job may be enqueued for this article given current active count.
 * If `sectionParallelWhitelist` is non-empty, section types **not** listed must run alone (`activeCount === 0`).
 */
export function canEnqueueDraftSection(
  merged: PipelineSettingShape,
  activeCount: number,
  sectionType: string,
): boolean {
  let cap = Math.max(1, Math.floor(merged.sectionParallelism) || 1)
  if (merged.sectionVariant === 'parallel_with_summary') {
    cap = Math.max(cap, 3)
  }
  const wl = merged.sectionParallelWhitelist
  const st = (sectionType || 'custom').trim() || 'custom'

  if (Array.isArray(wl) && wl.length > 0) {
    const inWl = wl.some((x) => String(x).trim() === st)
    if (!inWl) {
      return activeCount === 0
    }
    return activeCount < cap
  }

  return activeCount < cap
}
