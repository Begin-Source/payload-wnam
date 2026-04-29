export function normalizeDomain(input: unknown): string | null {
  if (input === undefined || input === null) return null
  let value = String(input).trim()
  if (!value) return null
  value = value
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*/, '')
    .replace(/\.$/, '')
  const host = value.split('@').pop() || value
  const namePart = host.includes('.') ? host.split('.').slice(0, -1).join('.') : host
  const name = String(namePart || '')
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase()
  if (!name || name.length < 4) return null
  return `${name}.com`
}

export function toTitleCase(value: string): string {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return ''
  return words
    .map((word) => {
      const s = String(word || '').replace(/[^a-zA-Z0-9]/g, '')
      if (!s) return ''
      return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
    })
    .filter(Boolean)
    .join(' ')
    .slice(0, 80)
    .trim()
}

export function domainToSiteName(domain: string): string {
  let value = String(domain || '').trim()
  if (!value) return ''
  value = value.replace(/^https?:\/\//i, '').replace(/\/.*/, '')
  if (value.includes('.')) {
    const parts = value.split('.')
    if (parts.length > 1) value = parts.slice(0, -1).join('.')
  }
  const segmented = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
  return toTitleCase(segmented)
}

function parseAiText(payload: Record<string, unknown>): { text: string; parsed: unknown } {
  const choices = payload.choices as { message?: { content?: string } }[] | undefined
  let text: string | undefined = choices?.[0]?.message?.content
  if (!text && typeof payload.text === 'string') text = payload.text
  if (!text && typeof payload.output === 'string') text = payload.output
  const resp = payload.response as { text?: string } | undefined
  if (!text && resp?.text) text = resp.text
  const cand = payload.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined
  if (!text && cand?.[0]?.content?.parts?.[0]?.text) {
    text = cand[0].content.parts[0].text
  }
  if (!text || typeof text !== 'string') return { text: '', parsed: null }
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
  try {
    return { text: cleaned, parsed: JSON.parse(cleaned) as unknown }
  } catch {
    return { text: cleaned, parsed: null }
  }
}

function makeFallbackItems(mainProduct: string, siteName: string): Array<{ domain: string; site_name: string }> {
  const rawSeed = String(mainProduct || siteName || '').trim()
  const seedWords = rawSeed
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
  if (!seedWords.length) return []
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1)
  const root = seedWords.map(cap).join('')
  const bases = [
    root,
    `${root}Guide`,
    `${root}Insider`,
    `${root}Central`,
    `${root}Expert`,
    `Trusted${root}`,
    `Pure${root}`,
    `Best${root}`,
    `${root}World`,
    `${root}Hub`,
    `${root}Lab`,
    `${root}Home`,
    `${root}Today`,
    `${root}Focus`,
    `${root}Pro`,
    `${root}Advisor`,
    `${root}Insight`,
    `${root}Source`,
    `${root}Choice`,
    `${root}Life`,
  ]
  return bases.map((name) => ({
    domain: `${name}.com`,
    site_name: domainToSiteName(name),
  }))
}

function coerceItems(
  payload: Record<string, unknown>,
  parsed: unknown,
  text: string,
): Array<{ domain?: unknown; site_name?: unknown; url?: unknown; name?: unknown }> {
  if (payload && Array.isArray(payload.items)) return payload.items as { domain?: unknown }[]
  if (payload && Array.isArray(payload.domains)) {
    return (payload.domains as unknown[]).map((d) => ({ domain: d }))
  }
  const data = payload.data as { items?: unknown[]; domains?: unknown[] } | undefined
  if (data && Array.isArray(data.items)) return data.items as { domain?: unknown }[]
  if (data && Array.isArray(data.domains)) {
    return data.domains.map((d) => ({ domain: d }))
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const p = parsed as { items?: unknown[]; domains?: unknown[] }
    if (Array.isArray(p.items)) return p.items as { domain?: unknown }[]
    if (Array.isArray(p.domains)) return p.domains.map((d) => ({ domain: d }))
  }
  if (Array.isArray(parsed)) return parsed as { domain?: unknown }[]
  if (text) {
    const lines = text
      .split('\n')
      .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
      .filter(Boolean)
    return lines.map((line) => ({ domain: line }))
  }
  return []
}

export type ParsedDomainBatch = {
  candidates: string[]
  siteNameMap: Record<string, string>
  aiMessage: string
}

/** n8n「Parse AI Domains」等价。 */
export function parseDomainCandidatesFromAi(
  raw: unknown,
  base: { mainProduct: string; siteName: string },
): ParsedDomainBatch {
  let aiItems: Array<{ domain?: unknown; site_name?: unknown; url?: unknown; name?: unknown }> = []
  let aiMessage = ''

  if (raw && typeof raw === 'object' && 'error' in raw) {
    const err = (raw as { error?: { message?: string }; message?: string }).error
    aiMessage = String(err?.message ?? (raw as { message?: string }).message ?? 'AI request failed')
  } else if (raw && typeof raw === 'object') {
    const { text, parsed } = parseAiText(raw as Record<string, unknown>)
    aiMessage = text || ''
    aiItems = coerceItems(raw as Record<string, unknown>, parsed, text)
  }

  if (!aiItems.length) {
    aiItems = makeFallbackItems(base.mainProduct, base.siteName)
  }

  const seen = new Set<string>()
  const candidates: string[] = []
  const siteNameMap: Record<string, string> = {}

  const pushItem = (entry: unknown) => {
    const obj =
      typeof entry === 'object' && entry !== null
        ? (entry as { domain?: unknown; site_name?: unknown; url?: unknown; name?: unknown })
        : null
    const domainInput = obj
      ? (obj.domain ?? obj.url ?? obj.name ?? '')
      : entry
    const siteNameInput = obj ? (obj.site_name ?? (obj as { siteName?: unknown }).siteName ?? '') : ''

    const normalizedDomain = normalizeDomain(domainInput)
    if (!normalizedDomain || seen.has(normalizedDomain)) return

    const computedSiteName =
      toTitleCase(String(siteNameInput || '')) || domainToSiteName(String(domainInput || normalizedDomain))
    if (!computedSiteName) return

    seen.add(normalizedDomain)
    candidates.push(normalizedDomain)
    siteNameMap[normalizedDomain] = computedSiteName
  }

  for (const entry of aiItems) {
    pushItem(entry)
    if (candidates.length >= 20) break
  }

  if (candidates.length < 20) {
    for (const entry of makeFallbackItems(base.mainProduct, base.siteName)) {
      pushItem(entry)
      if (candidates.length >= 20) break
    }
  }

  if (!candidates.length) {
    throw new Error('No valid .com domains generated under letters-only policy')
  }

  return {
    candidates,
    siteNameMap,
    aiMessage: aiMessage ? aiMessage.slice(0, 1000) : 'ok',
  }
}
