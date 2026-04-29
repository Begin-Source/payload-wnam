/**
 * DataForSEO HTTP client (Keyword / SERP / Merchant / Backlinks).
 * Auth: Basic base64(login:password) from env DATAFORSEO_AUTH or DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD.
 */
function getAuthHeader(): string {
  const raw = process.env.DATAFORSEO_AUTH?.trim()
  if (raw) {
    return raw.startsWith('Basic ') ? raw : `Basic ${raw}`
  }
  const login = process.env.DATAFORSEO_LOGIN?.trim()
  const password = process.env.DATAFORSEO_PASSWORD?.trim()
  if (!login || !password) {
    throw new Error('DataForSEO: set DATAFORSEO_AUTH or DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD')
  }
  const b64 = Buffer.from(`${login}:${password}`, 'utf8').toString('base64')
  return `Basic ${b64}`
}

export async function dataForSeoPost<T = unknown>(
  path: string,
  body: unknown[],
  init?: { signal?: AbortSignal },
): Promise<T> {
  const base = (process.env.DATAFORSEO_BASE_URL || 'https://api.dataforseo.com').replace(/\/$/, '')
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: init?.signal,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`DataForSEO ${res.status}: ${t.slice(0, 500)}`)
  }
  return (await res.json()) as T
}

export async function keywordDataLocationAndLanguage(_country = 'US'): Promise<{
  location_code: number
  language_code: string
}> {
  // Simplified US English defaults; full mapping can be expanded.
  return { location_code: 2840, language_code: 'en' }
}
