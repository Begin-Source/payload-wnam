import type { KeywordIntent } from '@/utilities/keywordEligibility'

const QUESTION_START = /\b(what|who|when|where|why|how|which|is|are|can|does|do|should|would|could)\b/i

/** Phrases that often produce AI-overview style answers. */
const GEO_PHRASES = [
  /\bbest\b/i,
  /\bvs\.?\b/i,
  /\bversus\b/i,
  /\blist of\b/i,
  /\btop \d+\b/i,
  /\bguide\b/i,
  /\btutorial\b/i,
  /\bdefinition\b/i,
  /\bmeaning\b/i,
  /\bmeaning of\b/i,
  /\bcompare\b/i,
  /\bcomparison\b/i,
  /\bhow to\b/i,
  /\bwhat is\b/i,
  /\bwhat are\b/i,
]

const LOW_SIGNAL = /\b(price|buy|cheap|coupon|near me|store|login|account)\b/i

/**
 * Heuristic for AI-search / GEO-oriented queries: questions, comparisons, definitions, how-tos.
 * Does not call external APIs; safe to run on sync and backfill.
 */
export function classifyGeoFriendly(term: string, intent: KeywordIntent | string | null | undefined): boolean {
  const t = (term ?? '').trim()
  if (!t) return false

  const intentStr = typeof intent === 'string' ? intent.toLowerCase() : ''

  let score = 0
  if (QUESTION_START.test(t)) score += 2
  if (t.includes('?')) score += 2
  let phraseHits = 0
  for (const re of GEO_PHRASES) {
    if (re.test(t)) phraseHits += 1
  }
  score += Math.min(2, phraseHits)
  if (t.split(/\s+/).filter(Boolean).length >= 5 && phraseHits >= 1) score += 1
  if (intentStr === 'informational') score += 1
  if (intentStr === 'commercial' && phraseHits > 0) score += 1

  if (LOW_SIGNAL.test(t)) score -= 1

  return score >= 2
}
