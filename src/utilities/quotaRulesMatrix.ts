import type { Payload } from 'payload'

/** Optional keys inside Global `quota-rules`.rules JSON for SEO matrix. */
export type QuotaRulesMatrixJson = {
  /** When set (>0), caps how many `sites` rows a tenant may have (non–super-admin creates). */
  maxSitesPerTenant?: number
}

export async function getQuotaRulesMatrix(payload: Payload): Promise<QuotaRulesMatrixJson> {
  try {
    const g = await payload.findGlobal({
      slug: 'quota-rules',
      overrideAccess: true,
    })
    const rules = (g as { rules?: unknown }).rules
    if (!rules || typeof rules !== 'object' || Array.isArray(rules)) return {}
    const o = rules as Record<string, unknown>
    const max = o.maxSitesPerTenant
    const maxSitesPerTenant =
      typeof max === 'number' && Number.isFinite(max) ? Math.max(0, Math.floor(max)) : undefined
    return { maxSitesPerTenant }
  } catch {
    return {}
  }
}
