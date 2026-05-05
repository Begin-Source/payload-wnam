import type { Payload } from 'payload'

import { computeOpportunityScore } from '@/utilities/keywordOpportunity'
import type { PipelineSettingShape } from '@/utilities/pipelineSettingShape'

export type KeywordIntent = 'informational' | 'navigational' | 'commercial' | 'transactional'

const INTENT_SET = new Set<string>(['informational', 'navigational', 'commercial', 'transactional'])

export type AmzKeywordEligibilityThresholds = {
  intentWhitelist: KeywordIntent[]
  minVolume: number
  maxKd: number
  minOpportunityScore: number
  pullLimit: number
}

export const DEFAULT_AMZ_KEYWORD_ELIGIBILITY_THRESHOLDS: AmzKeywordEligibilityThresholds = {
  intentWhitelist: ['commercial', 'transactional'],
  minVolume: 200,
  maxKd: 60,
  minOpportunityScore: 30,
  pullLimit: 200,
}

function clampNumber(n: unknown, fallback: number, min: number, max: number): number {
  const x = Number(n)
  if (!Number.isFinite(x)) return fallback
  return Math.min(max, Math.max(min, x))
}

function parseIntentList(raw: unknown): KeywordIntent[] {
  if (!Array.isArray(raw)) return [...DEFAULT_AMZ_KEYWORD_ELIGIBILITY_THRESHOLDS.intentWhitelist]
  const out: KeywordIntent[] = []
  for (const x of raw) {
    if (typeof x === 'string' && INTENT_SET.has(x)) {
      out.push(x as KeywordIntent)
    }
  }
  return out.length > 0 ? out : [...DEFAULT_AMZ_KEYWORD_ELIGIBILITY_THRESHOLDS.intentWhitelist]
}

export function parseAmzKeywordEligibilityJson(raw: unknown): AmzKeywordEligibilityThresholds {
  const d = DEFAULT_AMZ_KEYWORD_ELIGIBILITY_THRESHOLDS
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...d, intentWhitelist: [...d.intentWhitelist] }
  }
  const o = raw as Record<string, unknown>
  return {
    intentWhitelist: parseIntentList(o.intentWhitelist),
    minVolume: clampNumber(o.minVolume, d.minVolume, 0, 10_000_000),
    maxKd: clampNumber(o.maxKd, d.maxKd, 1, 100),
    minOpportunityScore: clampNumber(o.minOpportunityScore, d.minOpportunityScore, 0, 10_000_000),
    pullLimit: clampNumber(o.pullLimit, d.pullLimit, 1, 500),
  }
}

export function normalizeKeywordIntent(raw: string | undefined | null): KeywordIntent {
  const s = (raw ?? 'informational').toLowerCase()
  if (s.includes('transaction')) return 'transactional'
  if (s.includes('commercial')) return 'commercial'
  if (s.includes('navigat')) return 'navigational'
  return 'informational'
}

function mergeThresholdOverrides(
  base: AmzKeywordEligibilityThresholds,
  overrides?: Partial<AmzKeywordEligibilityThresholds>,
): AmzKeywordEligibilityThresholds {
  if (!overrides) {
    return { ...base, intentWhitelist: [...base.intentWhitelist] }
  }
  const intentWhitelist =
    Array.isArray(overrides.intentWhitelist) && overrides.intentWhitelist.length > 0
      ? (overrides.intentWhitelist.filter((x) => INTENT_SET.has(x)) as KeywordIntent[])
      : [...base.intentWhitelist]
  return {
    intentWhitelist: intentWhitelist.length > 0 ? intentWhitelist : [...base.intentWhitelist],
    minVolume:
      overrides.minVolume != null
        ? clampNumber(overrides.minVolume, base.minVolume, 0, 10_000_000)
        : base.minVolume,
    maxKd:
      overrides.maxKd != null ? clampNumber(overrides.maxKd, base.maxKd, 1, 100) : base.maxKd,
    minOpportunityScore:
      overrides.minOpportunityScore != null
        ? clampNumber(overrides.minOpportunityScore, base.minOpportunityScore, 0, 10_000_000)
        : base.minOpportunityScore,
    pullLimit:
      overrides.pullLimit != null
        ? clampNumber(overrides.pullLimit, base.pullLimit, 1, 500)
        : base.pullLimit,
  }
}

export async function loadAmzEligibilityThresholds(
  payload: Payload,
  overrides?: Partial<AmzKeywordEligibilityThresholds>,
): Promise<AmzKeywordEligibilityThresholds> {
  const g = await payload.findGlobal({ slug: 'pipeline-settings', depth: 0 })
  const doc = g as { amzKeywordEligibility?: unknown } | null
  const parsed = parseAmzKeywordEligibilityJson(doc?.amzKeywordEligibility)
  return mergeThresholdOverrides(parsed, overrides)
}

/** Use merged pipeline shape (global + profile overrides) instead of reading Global again. */
export function loadAmzEligibilityThresholdsFromMerged(
  merged: PipelineSettingShape,
  overrides?: Partial<AmzKeywordEligibilityThresholds>,
): AmzKeywordEligibilityThresholds {
  const parsed = parseAmzKeywordEligibilityJson(merged.amzKeywordEligibility)
  return mergeThresholdOverrides(parsed, overrides)
}

export function evaluateKeywordEligibility(
  row: {
    intent: KeywordIntent | string | null | undefined
    volume: number
    keywordDifficulty: number
    opportunityScore: number
  },
  t: AmzKeywordEligibilityThresholds,
): { eligible: boolean; reason: string } {
  const intent = normalizeKeywordIntent(
    typeof row.intent === 'string' ? row.intent : String(row.intent ?? ''),
  )
  const vol = Math.max(0, Number(row.volume) || 0)
  const kd = Math.max(0, Number(row.keywordDifficulty) || 0)
  const score = Math.max(0, Number(row.opportunityScore) || 0)

  if (!t.intentWhitelist.includes(intent)) {
    return {
      eligible: false,
      reason: `FAIL: intent=${intent} not in whitelist [${t.intentWhitelist.join(', ')}]`,
    }
  }
  if (vol < t.minVolume) {
    return {
      eligible: false,
      reason: `FAIL: volume=${vol} < minVolume=${t.minVolume}; intent=${intent}; kd=${kd}; score=${score}`,
    }
  }
  if (kd > t.maxKd) {
    return {
      eligible: false,
      reason: `FAIL: kd=${kd} > maxKd=${t.maxKd}; intent=${intent}; vol=${vol}; score=${score}`,
    }
  }
  if (score < t.minOpportunityScore) {
    return {
      eligible: false,
      reason: `FAIL: opportunityScore=${score} < min=${t.minOpportunityScore}; intent=${intent}; vol=${vol}; kd=${kd}`,
    }
  }
  return {
    eligible: true,
    reason: `intent=${intent}; vol=${vol}; kd=${kd}; score=${score} -> ELIGIBLE`,
  }
}

export function opportunityForKeywordRow(input: {
  volume: number
  keywordDifficulty: number
  intent: KeywordIntent | string | null | undefined
}): number {
  const intent = normalizeKeywordIntent(
    typeof input.intent === 'string' ? input.intent : String(input.intent ?? ''),
  )
  return computeOpportunityScore({
    volume: input.volume,
    keywordDifficulty: input.keywordDifficulty,
    intent,
  })
}
