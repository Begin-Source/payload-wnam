function parseJsonLoose(text: string): unknown {
  if (!text) return null
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
  try {
    return JSON.parse(cleaned) as unknown
  } catch {
    return null
  }
}

function normalizeAudience(value: unknown): string | null {
  const s = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return null
  return s.length > 80 ? s.slice(0, 80).trim() : s
}

function makeFallbackAudiences(product: string): string[] {
  const p = product.trim() || 'this product'
  return [
    `first-time ${p} buyers`,
    `busy families using ${p} daily`,
    `budget-conscious shoppers for ${p}`,
    `${p} enthusiasts comparing features`,
    `quality-focused home users of ${p}`,
  ]
}

export type ParsedAudiences = {
  audienceCandidates: string[]
  selectedAudience: string
  selectedAudienceIndex: number
}

/** n8n「Parse + Pick Audience」等价（含 fallback 与随机选择）。 */
export function parseAndPickAudiences(
  rawText: string,
  base: { mainProduct: string; siteName: string },
  hasAiError: boolean,
): ParsedAudiences {
  let audiences: unknown[] = []

  if (!hasAiError && rawText) {
    const parsed = parseJsonLoose(rawText)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const o = parsed as { audiences?: unknown }
      if (Array.isArray(o.audiences)) audiences = o.audiences
    } else if (Array.isArray(parsed)) {
      audiences = parsed
    } else {
      audiences = rawText
        .split('\n')
        .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
        .filter(Boolean)
    }
  }

  const deduped: string[] = []
  const seen = new Set<string>()
  for (const item of audiences) {
    const v = normalizeAudience(item)
    if (!v) continue
    const k = v.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    deduped.push(v)
    if (deduped.length >= 5) break
  }

  const seed = (base.mainProduct || base.siteName || 'this product').trim()
  for (const item of makeFallbackAudiences(seed)) {
    if (deduped.length >= 5) break
    const v = normalizeAudience(item)
    const k = String(v || '').toLowerCase()
    if (!v || seen.has(k)) continue
    seen.add(k)
    deduped.push(v)
  }

  if (!deduped.length) {
    throw new Error('No audience candidates generated')
  }

  const selectedIndex = Math.floor(Math.random() * deduped.length)
  const selectedAudience = deduped[selectedIndex] ?? deduped[0]!

  return {
    audienceCandidates: deduped,
    selectedAudience,
    selectedAudienceIndex: selectedIndex,
  }
}
