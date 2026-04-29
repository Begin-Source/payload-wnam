export const INTENT_VALUE: Record<string, number> = {
  informational: 1,
  navigational: 1,
  commercial: 2,
  transactional: 3,
}

/**
 * `opportunityScore = volume * intentValue / max(kd, 1)` (plan §6.1).
 */
export function computeOpportunityScore(input: {
  volume: number
  keywordDifficulty: number
  intent?: string | null
}): number {
  const intent = (input.intent ?? 'informational').toLowerCase()
  const iv = INTENT_VALUE[intent] ?? 1
  const kd = Math.max(Number(input.keywordDifficulty) || 0, 1)
  const vol = Math.max(Number(input.volume) || 0, 0)
  return Math.round((vol * iv) / kd)
}
