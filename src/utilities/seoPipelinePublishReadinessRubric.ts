/**
 * Heuristic 0–100 score for **pipeline profile fields** (not rendered article text).
 * Aligns with themes from `.agents/skills/content-quality-auditor` (research depth,
 * trust/finalize gate, EEAT emphasis via weights + `articleStrategy.seoWorkflow`) and
 * `.agents/skills/pipeline-seo-mapping` (keyword gates, data sources).
 *
 * Use to compare A/B pipeline presets before spending API quota on full runs.
 */

import {
  normalizeBriefDepth,
  normalizeBriefVariant,
  normalizeFinalizeVariant,
  normalizeSectionVariant,
  normalizeSkeletonVariant,
} from '@/utilities/pipelineVariants'

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** Keyword pocket strictness (higher = closer to “publish-grade” SERP competition). */
function scoreKeywordGate(raw: unknown): number {
  const o = asRecord(raw)
  if (!o) return 0
  const minVol = num(o.minVolume)
  const maxKd = num(o.maxKd)
  const minOpp = num(o.minOpportunityScore)
  let s = 0
  if (minVol >= 350) s += 4
  else if (minVol >= 280) s += 3
  else if (minVol >= 200) s += 2
  else if (minVol >= 120) s += 1
  if (maxKd <= 40) s += 4
  else if (maxKd <= 48) s += 3
  else if (maxKd <= 55) s += 2
  else if (maxKd <= 65) s += 1
  if (minOpp >= 40) s += 2
  else if (minOpp >= 32) s += 2
  else if (minOpp >= 25) s += 1
  return Math.min(10, s)
}

function scoreSeoWorkflow(articleStrategy: unknown): number {
  const root = asRecord(articleStrategy)
  const sw = root ? asRecord(root.seoWorkflow) : null
  const gate = root ? asRecord(root.contentQualityGate) : null
  if (!sw) return 0
  let s = 0
  if (typeof sw.workflowMode === 'string' && sw.workflowMode.trim()) s += 2
  if (typeof sw.qualityTier === 'string' && sw.qualityTier === 'publish_grade') s += 3
  if (Array.isArray(sw.contentArchetypes) && sw.contentArchetypes.length >= 2) s += 2
  const tw = num(sw.targetTotalWords)
  if (tw >= 2000) s += 2
  else if (tw >= 1400) s += 1
  const anchors = num(sw.minSpecificityAnchorsPerSection)
  if (anchors >= 3) s += 1
  const minQuality = Math.max(num(sw.minQualityScore), num(gate?.minOverallScore))
  if (minQuality >= 80) s += 1
  return Math.min(10, s)
}

/**
 * @param fields — Typical `pipeline-profiles` document data (merged overrides only is fine).
 * @returns Integer 0–100 before vetoes; `hardBlocked` when critical gates are off.
 */
export function scorePipelineProfilePublishReadiness(fields: Record<string, unknown>): {
  overall: number
  hardBlocked: boolean
  breakdown: Record<string, number>
} {
  const tavily = fields.tavilyEnabled === true
  const dfs = fields.dataForSeoEnabled === true
  let research = 0
  if (tavily && dfs) research = 22
  else if (tavily || dfs) research = 11
  else research = 0

  const briefDepth = normalizeBriefDepth(fields.briefDepth)
  let depth = 0
  if (briefDepth === 'deep') depth += 10
  else if (briefDepth === 'standard') depth += 7
  else depth += 4

  const briefVar = normalizeBriefVariant(fields.briefVariant)
  if (briefVar === 'dfs_serp_first') depth += 5
  else if (briefVar === 'competitor_mimic') depth += 4
  else depth += 3
  depth = Math.min(15, depth)

  const sk = normalizeSkeletonVariant(fields.skeletonVariant)
  let drafting = 0
  if (sk === 'cluster_driven') drafting += 6
  else if (sk === 'top10_blend') drafting += 5
  else drafting += 4

  const sec = normalizeSectionVariant(fields.sectionVariant)
  if (sec === 'research_per_section') drafting += 14
  else if (sec === 'parallel_with_summary') drafting += 11
  else drafting += 7
  drafting = Math.min(20, drafting)

  const fin = normalizeFinalizeVariant(fields.finalizeVariant)
  let finalize = 0
  if (fin === 'eeat_rewrite_pass') finalize = 15
  else if (fin === 'fact_check_pass') finalize = 13
  else finalize = 5

  const retries = num(fields.sectionMaxRetry)
  let resilience = 0
  if (retries >= 4) resilience += 7
  else if (retries >= 3) resilience += 5
  else if (retries >= 2) resilience += 3
  const par = num(fields.sectionParallelism)
  if (par >= 2) resilience += 3
  else if (par >= 1) resilience += 2
  resilience = Math.min(10, resilience)

  const kw = scoreKeywordGate(fields.amzKeywordEligibility)
  const strat = scoreSeoWorkflow(fields.articleStrategy)

  const hardBlocked = !tavily || !dfs || fin === 'simple_merge'

  const raw =
    research + depth + drafting + finalize + resilience + Math.min(10, kw) + Math.min(10, strat)

  const overall = Math.max(0, Math.min(100, Math.round(raw)))

  return {
    overall,
    hardBlocked,
    breakdown: {
      research,
      briefDepthAndVariant: depth,
      drafting,
      finalize,
      resilience,
      keywordGate: Math.min(10, kw),
      articleStrategy: Math.min(10, strat),
    },
  }
}
