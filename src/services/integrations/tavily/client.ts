import { createHash } from 'node:crypto'

const DEFAULT_BASE = 'https://api.tavily.com'
const CACHE_PREFIX = 'tavily-cache/'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type TavilySearchParams = {
  query: string
  topic?: 'general' | 'news' | 'finance'
  search_depth?: 'basic' | 'advanced'
  include_raw_content?: boolean
  max_results?: number
}

/** Tavily response body plus cache hint — callers must only bill quotas when `cacheHit` is false. */
export type TavilySearchResult = { body: unknown; cacheHit: boolean }

function cacheKey(params: TavilySearchParams): string {
  const raw = JSON.stringify({
    q: params.query,
    t: params.topic || 'general',
    d: params.search_depth || 'advanced',
    r: params.include_raw_content ?? true,
    m: params.max_results ?? 12,
  })
  return createHash('sha256').update(raw).digest('hex')
}

type CacheEnvelope = { expiresAt: number; body: unknown }

async function readR2Json(key: string): Promise<unknown | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const ctx = getCloudflareContext()
    const bucket = (ctx.env as { R2?: { get: (k: string) => Promise<{ text: () => Promise<string> } | null> } }).R2
    if (!bucket?.get) return null
    const obj = await bucket.get(key)
    if (!obj) return null
    const txt = await obj.text()
    const env = JSON.parse(txt) as CacheEnvelope
    if (!env || typeof env.expiresAt !== 'number' || Date.now() > env.expiresAt) return null
    return env.body
  } catch {
    return null
  }
}

async function writeR2Json(key: string, body: unknown): Promise<void> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const ctx = getCloudflareContext()
    const bucket = (ctx.env as { R2?: { put: (k: string, v: string) => Promise<unknown> } }).R2
    if (!bucket?.put) return
    const envelope: CacheEnvelope = { expiresAt: Date.now() + CACHE_TTL_MS, body }
    await bucket.put(key, JSON.stringify(envelope))
  } catch {
    /* dev / no binding */
  }
}

export async function tavilySearch(
  params: TavilySearchParams,
  init?: { signal?: AbortSignal },
): Promise<TavilySearchResult> {
  const key = `${CACHE_PREFIX}${cacheKey(params)}`
  const cached = await readR2Json(key)
  if (cached != null) {
    return { body: cached, cacheHit: true }
  }

  const apiKey = process.env.TAVILY_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is not set')
  }
  const base = (process.env.TAVILY_BASE_URL || DEFAULT_BASE).replace(/\/$/, '')
  const res = await fetch(`${base}/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: params.query,
      topic: params.topic || 'general',
      search_depth: params.search_depth || 'advanced',
      include_raw_content: params.include_raw_content ?? true,
      max_results: params.max_results ?? 12,
      include_usage: true,
    }),
    signal: init?.signal,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Tavily ${res.status}: ${t.slice(0, 500)}`)
  }
  const body: unknown = await res.json()
  await writeR2Json(key, body)
  return { body, cacheHit: false }
}
