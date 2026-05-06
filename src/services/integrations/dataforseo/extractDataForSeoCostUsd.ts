/**
 * Sum DataForSEO Standard API envelope `tasks[].cost` (USD per task).
 * https://docs.dataforseo.com/v3/
 */
export function extractDataForSeoCostUsd(envelope: unknown): number {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return 0
  const tasks = (envelope as { tasks?: unknown }).tasks
  if (!Array.isArray(tasks)) return 0
  let sum = 0
  for (const t of tasks) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) continue
    const c = (t as { cost?: unknown }).cost
    const n = typeof c === 'number' ? c : Number(c)
    if (Number.isFinite(n) && n > 0 && n < 1e9) sum += n
  }
  return Math.round(sum * 1e9) / 1e9
}
