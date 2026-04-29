const SPACESHIP_URL = 'https://spaceship.dev/api/v1/domains/available'

export type SpaceshipDomainRow = {
  domain?: string
  result?: string
  status?: string
  available?: boolean
  premium?: boolean
  isPremium?: boolean
  premiumDomain?: boolean
  premiumPricing?: unknown
  message?: string
  reason?: string
}

export type SpaceshipAvailabilityResponse = {
  domains?: SpaceshipDomainRow[]
  error?: { message?: string }
  message?: string
}

export function isPremiumDomainRow(row: SpaceshipDomainRow): boolean {
  if (!row || typeof row !== 'object') return false
  if (row.premium === true || row.isPremium === true || row.premiumDomain === true) return true
  const pp = row.premiumPricing
  if (Array.isArray(pp)) return pp.length > 0
  if (pp && typeof pp === 'object') return Object.keys(pp as object).length > 0
  if (typeof pp === 'number') return pp > 0
  if (typeof pp === 'string') {
    const t = pp.trim()
    return t !== '' && t !== '0' && t.toLowerCase() !== 'false' && t.toLowerCase() !== 'null'
  }
  return false
}

/** POST bulk availability; env SPACESHIP_API_KEY + SPACESHIP_API_SECRET（与 n8n 头一致）。 */
export async function checkSpaceshipDomains(
  candidates: string[],
  init?: { signal?: AbortSignal },
): Promise<SpaceshipAvailabilityResponse> {
  const key = process.env.SPACESHIP_API_KEY?.trim()
  const secret = process.env.SPACESHIP_API_SECRET?.trim()
  if (!key || !secret) {
    return { error: { message: 'SPACESHIP_API_KEY / SPACESHIP_API_SECRET not configured' } }
  }

  try {
    const res = await fetch(SPACESHIP_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': key,
        'X-API-Secret': secret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ domains: candidates }),
      signal: init?.signal,
    })
    const data = (await res.json().catch(() => ({}))) as SpaceshipAvailabilityResponse
    if (!res.ok) {
      return {
        error: {
          message: `Spaceship HTTP ${res.status}: ${JSON.stringify(data).slice(0, 400)}`,
        },
      }
    }
    return data
  } catch (e) {
    return {
      error: { message: e instanceof Error ? e.message : String(e) },
    }
  }
}
