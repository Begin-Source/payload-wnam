/** Tavily Search JSON when `include_usage` is true. */
export function extractTavilyUsageCredits(body: unknown): number | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const u = (body as { usage?: unknown }).usage
  if (!u || typeof u !== 'object' || Array.isArray(u)) return null
  const c = (u as { credits?: unknown }).credits
  const n = typeof c === 'number' ? c : Number(c)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

export function tavilyCreditsToUsd(credits: number): number {
  const raw = process.env.TAVILY_USD_PER_CREDIT?.trim()
  const rate = raw ? Number(raw) : 0.008
  if (!Number.isFinite(rate) || rate <= 0) return 0
  return Math.round(credits * rate * 1e6) / 1e6
}
