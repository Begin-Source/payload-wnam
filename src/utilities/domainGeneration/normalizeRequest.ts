export type GenerateDomainRequestNormalized = {
  siteIds: string[]
  force: boolean
  aiModel: string
}

function coerceKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v ?? '').trim()).filter(Boolean)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (Array.isArray(parsed)) return parsed.map((v) => String(v ?? '').trim()).filter(Boolean)
      } catch {
        /* ignore */
      }
    }
    if (trimmed.includes(',')) return trimmed.split(',').map((v) => v.trim()).filter(Boolean)
    return [trimmed]
  }
  if (value !== undefined && value !== null) return [String(value).trim()].filter(Boolean)
  return []
}

function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const s = String(value ?? '')
    .trim()
    .toLowerCase()
  return s === 'true' || s === '1' || s === 'yes' || s === 'on'
}

/** n8n「Normalize Request」等价：body.keys | site_ids | site_id | id */
export function normalizeGenerateDomainBody(body: Record<string, unknown>): GenerateDomainRequestNormalized {
  let keys = coerceKeys(body.keys ?? body.site_ids ?? body.site_id ?? body.id)
  keys = keys
    .map((v) => String(v || '').trim())
    .filter((v) => v && v !== 'undefined' && v !== 'null')

  if (!keys.length) {
    throw new Error('keys/site_id missing')
  }

  const force = toBool(body.force ?? body.force_create)
  const aiModel =
    String(body.ai_model || body.aiModel || 'google/gemini-2.5-flash').trim() || 'google/gemini-2.5-flash'

  return { siteIds: keys, force, aiModel }
}
