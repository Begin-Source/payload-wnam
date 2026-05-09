/** Max ids accepted by GET /api/admin/pipeline/writing-scope-labels */
export const MAX_WRITING_SCOPE_LABEL_IDS = 100

/** Parse comma-separated positive integers, dedupe, cap length (for label querystrings). */
export function parseCommaSeparatedPositiveInts(
  param: string | null,
  max = MAX_WRITING_SCOPE_LABEL_IDS,
): number[] {
  if (param == null || !param.trim()) return []
  const seen = new Set<number>()
  for (const part of param.split(',')) {
    const t = part.trim()
    if (!/^\d+$/.test(t)) continue
    const n = Number(t)
    if (Number.isFinite(n) && n > 0) seen.add(Math.floor(n))
    if (seen.size >= max) break
  }
  return [...seen].sort((a, b) => a - b)
}
