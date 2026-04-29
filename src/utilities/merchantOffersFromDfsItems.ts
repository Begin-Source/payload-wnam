/**
 * Ports n8n `PB | Build Product Creates` for Payload `offers`.
 * Ranks/dedupes DFS Merchant raw_items and returns create payloads + summary.
 */

export type MerchantOfferSlotBuildContext = {
  categoryId: number
  /** Category name for token match (n8n `category` / keyword display). */
  category: string
  seedInput: string
  fetchAsinLimit: number
  /** From category summary (n8n `seed_status`): when `fetched`, skip creates unless forced. */
  seedStatusLower: string
  ready: boolean
  rawItems: unknown[]
  /** Offers already tied to site + category; ASIN dedupe source. */
  existingOffers: ReadonlyArray<{
    amazon?: { asin?: string | null } | null
  } | null | undefined>
  /** When true, ignore seedStatusLower === `fetched` early exit. */
  force?: boolean
}

export type MerchantOfferCreatePatch = {
  title: string
  slug?: string | null
  status: 'active'
  amazon: {
    asin?: string | null
    priceCents?: number | null
    currency?: string | null
    ratingAvg?: number | null
    reviewCount?: number | null
    imageUrl?: string | null
    merchantRaw?: unknown
    /** Near-full DFS raw item (byte-capped); stored as `amazon_dfs_snapshot`. */
    dfsSnapshot?: unknown
    merchantLastSyncedAt?: string
  }
}

export type MerchantSlotBuildOutcome = MerchantOfferSlotBuildContext & {
  limit: number
  existing_for_category: number
  candidate_pool_size: number
  create_items: MerchantOfferCreatePatch[]
  create_count: number
  total_for_category: number
  mark_fetched: boolean
  reason:
    | 'already_fetched'
    | 'task_not_ready'
    | 'ok'
    | 'insufficient_candidates'
    | 'no_products'
}

function normalize(v: unknown): string {
  return String(v ?? '').toLowerCase()
}

function toFeatures(item: Record<string, unknown>): string[] {
  const out: string[] = []
  const description = String(item?.description ?? '').trim()
  if (description) out.push(description)
  const info = Array.isArray(item?.product_information) ? item.product_information : []
  for (const section of info) {
    const sec = section as { body?: Record<string, unknown> }
    if (sec?.body && typeof sec.body === 'object') {
      for (const [k, val] of Object.entries(sec.body)) {
        const value = String(val ?? '').trim()
        if (!value) continue
        out.push(`${k}: ${value}`)
      }
    }
  }
  return out.slice(0, 20)
}

function moneyToCents(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value))
    return Math.round(value * 100)
  const n = Number(value)
  if (Number.isFinite(n)) return Math.round(n * 100)
  return undefined
}

function resolvePriceMajor(item: Record<string, unknown>): number | undefined {
  const price = item.price as Record<string, unknown> | undefined
  const cand =
    price?.current ?? price?.display_price ?? (item.price_from as unknown) ?? (item.price as unknown)
  const n =
    typeof cand === 'number' && Number.isFinite(cand)
      ? cand
      : Number(
          typeof cand === 'string' ? cand.replace(/[^0-9.]/g, '') : cand ?? NaN,
        )
  return Number.isFinite(n) ? n : undefined
}

/** D1: max SQL statement ~100KB for entire INSERT; merchantRaw must leave headroom for other columns + escaping. */
export const MERCHANT_RAW_MAX_UTF8_BYTES = 28 * 1024

const IMAGE_URL_MAX_LEN = 512

export function merchantRawUtf8Bytes(obj: unknown): number {
  return new TextEncoder().encode(JSON.stringify(obj)).length
}

function jsonUtf8Bytes(obj: unknown): number {
  return merchantRawUtf8Bytes(obj)
}

/** `/dp/B0ABCDEF123` or `/gp/product/B0ABCDEF123` on any amazon.* host */
const AMAZON_ASIN_PATH_RE =
  /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$|[\/?&#])/i

function tryCanonicalAmazonDpUrl(u: string): string | null {
  const t = String(u ?? '').trim()
  if (!t) return null
  try {
    const url = new URL(t)
    if (!url.hostname.toLowerCase().includes('amazon.')) return null
    const pathAndQuery = `${url.pathname}${url.search}`
    const m = pathAndQuery.match(AMAZON_ASIN_PATH_RE) ?? url.pathname.match(/\/dp\/([A-Z0-9]{10})/i)
    if (!m?.[1]) return null
    const a = m[1].toUpperCase()
    return /^[A-Z0-9]{10}$/.test(a) ? `https://www.amazon.com/dp/${a}` : null
  } catch {
    return null
  }
}

function truncateStr(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, Math.max(0, max - 1))}…`
}

/**
 * CDN / product URLs: normalize Amazon shopping links to short `/dp/{ASIN}`;
 * otherwise cap `origin + pathname + search` (sponsored paths can be huge without a query).
 */
function shortenUrlForStorage(u: string, maxLen: number): string {
  const canon = tryCanonicalAmazonDpUrl(u)
  if (canon) return canon

  const t = String(u ?? '').trim()
  if (!t) return ''
  try {
    const url = new URL(t)
    let base = `${url.origin}${url.pathname}${url.search}`
    if (base.length > maxLen) base = truncateStr(base, maxLen)
    return base
  } catch {
    return truncateStr(t, Math.min(maxLen, 320))
  }
}

/** Near-full DFS item for `amazon_dfs_snapshot`; separate cap from slim `merchantRaw`. */
export const DFS_SNAPSHOT_MAX_UTF8_BYTES = 36 * 1024

/** DFS Merchant Amazon raw item: bullets / specs — normalize early so shedding can shrink these before `product_information`. */
const DFS_SNAPSHOT_SELLING_POINT_KEYS = [
  'features',
  'functions',
  'bullet_points',
  'feature_bullets',
  'feature_bullets_flat',
  'about_this_item',
  'product_benefits',
] as const

/** Max UTF-8-aware character cap per bullet line after normalization (string length proxy). */
const DFS_SNAPSHOT_STRING_PER_LINE_MAX = 720

/** Initial max rows per selling-point array (shedding pops more later). */
const DFS_SNAPSHOT_SELLING_ARRAY_MAX_ITEMS = 56

function dfsSnapshotCoerceLine(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/**
 * Trim bullet arrays / string lists DFS uses for features & similar fields (aliases above).
 */
function normalizeDfsSellingPointArrays(o: Record<string, unknown>): void {
  for (const key of DFS_SNAPSHOT_SELLING_POINT_KEYS) {
    const v = o[key]
    if (!Array.isArray(v) || v.length === 0) continue
    const lines = v
      .map((x) => truncateStr(dfsSnapshotCoerceLine(x), DFS_SNAPSHOT_STRING_PER_LINE_MAX))
      .filter((s) => s.length > 0)
    o[key] = lines.slice(0, DFS_SNAPSHOT_SELLING_ARRAY_MAX_ITEMS)
  }
}

/**
 * One step toward byte budget by shrinking selling-point arrays before touching `product_information`.
 * Returns true if the document was modified.
 */
function shrinkDfsSellingPointArraysStep(o: Record<string, unknown>): boolean {
  for (const key of DFS_SNAPSHOT_SELLING_POINT_KEYS) {
    const v = o[key]
    if (!Array.isArray(v) || v.length === 0) continue
    if (v.length > 10) {
      o[key] = v.slice(0, Math.max(0, v.length - 5))
      return true
    }
  }
  for (const key of DFS_SNAPSHOT_SELLING_POINT_KEYS) {
    const v = o[key]
    if (!Array.isArray(v) || v.length <= 1) continue
    o[key] = v.slice(0, v.length - 2)
    return true
  }
  for (const key of DFS_SNAPSHOT_SELLING_POINT_KEYS) {
    const v = o[key]
    if (!Array.isArray(v)) continue
    let changed = false
    const next = v.map((x) => {
      const s = dfsSnapshotCoerceLine(x)
      if (s.length <= 160) return s
      changed = true
      return truncateStr(s, Math.max(120, Math.floor(s.length * 0.62)))
    })
    if (changed) {
      o[key] = next
      return true
    }
  }
  for (const key of DFS_SNAPSHOT_SELLING_POINT_KEYS) {
    if (Array.isArray(o[key]) && (o[key] as unknown[]).length > 0) {
      delete o[key]
      return true
    }
  }
  return false
}

function cloneDfsItem(item: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(item)) as Record<string, unknown>
  } catch {
    return { ...item }
  }
}

function snapshotUtf8Bytes(obj: unknown): number {
  return new TextEncoder().encode(JSON.stringify(obj)).length
}

/**
 * Preserve as much DFS payload as fits per-offer snapshot; shortens URLs then drops bulky keys.
 */
export function buildDfsSnapshotForStorage(item: Record<string, unknown>): Record<string, unknown> {
  const o = cloneDfsItem(item)

  const shortenUrlsFirstPass = (): void => {
    for (const key of ['url', 'landing_url', 'image_url']) {
      const v = o[key]
      if (typeof v === 'string')
        (o as Record<string, unknown>)[key] = shortenUrlForStorage(
          v,
          key === 'image_url' ? IMAGE_URL_MAX_LEN : 600,
        )
    }
    if (Array.isArray(o.product_images_list)) {
      o.product_images_list = (o.product_images_list as unknown[])
        .slice(0, 16)
        .map((x) => shortenUrlForStorage(String(x ?? ''), 400))
    }
    if (typeof o.description === 'string' && o.description.length > 6000) {
      o.description = truncateStr(o.description, 6000)
    }
  }

  shortenUrlsFirstPass()
  normalizeDfsSellingPointArrays(o)

  while (snapshotUtf8Bytes(o) > DFS_SNAPSHOT_MAX_UTF8_BYTES) {
    ;(o as Record<string, unknown>)._snapshot_truncated = true
    if (shrinkDfsSellingPointArraysStep(o)) continue
    if (Array.isArray(o.product_information) && (o.product_information as unknown[]).length) {
      o.product_information = (o.product_information as unknown[]).slice(
        0,
        Math.max(0, (o.product_information as unknown[]).length - 2),
      )
      continue
    }
    delete o.product_information
    if (typeof o.description === 'string' && o.description.length > 800) {
      o.description = truncateStr(o.description, 800)
      continue
    }
    delete o.description
    if (Array.isArray(o.product_images_list) && (o.product_images_list as unknown[]).length > 2) {
      o.product_images_list = (o.product_images_list as unknown[]).slice(0, 2)
      shortenUrlsFirstPass()
      continue
    }
    delete o.product_images_list
    if (typeof o.title === 'string') o.title = truncateStr(o.title, 180)
    if (snapshotUtf8Bytes(o) <= DFS_SNAPSHOT_MAX_UTF8_BYTES) break
    ;(o as Record<string, unknown>)._snapshot_truncated = true
    break
  }

  if (snapshotUtf8Bytes(o) > DFS_SNAPSHOT_MAX_UTF8_BYTES) {
    return clampDfsSnapshotDocument(o)
  }
  return o
}

/** Second-line guard before insert if snapshot still exceeds cap (should be rare). */
export function clampDfsSnapshotDocument(raw: unknown): Record<string, unknown> {
  if (raw === null || raw === undefined) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) return {}
  const rec = raw as Record<string, unknown>
  const o = { ...rec }

  while (snapshotUtf8Bytes(o) > DFS_SNAPSHOT_MAX_UTF8_BYTES) {
    ;(o as Record<string, unknown>)._snapshot_truncated = true
    delete o.product_information
    delete o.description
    delete o.product_images_list
    for (const key of DFS_SNAPSHOT_SELLING_POINT_KEYS) {
      delete o[key]
    }
    if (typeof o.title === 'string') o.title = truncateStr(o.title, 80)
    if (snapshotUtf8Bytes(o) <= DFS_SNAPSHOT_MAX_UTF8_BYTES) break
    return {
      asin: o.asin,
      data_asin: o.data_asin,
      title: typeof o.title === 'string' ? truncateStr(o.title, 120) : o.title,
      type: o.type,
      _snapshot_truncated: true,
    }
  }
  return o
}

/**
 * Second-line guard before DB insert: trim `features` / `title` / `price` before dropping `image_url`.
 */
export function clampMerchantRawDocument(raw: unknown): Record<string, unknown> {
  if (raw === null || raw === undefined) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) return {}
  const o = { ...(raw as Record<string, unknown>) }

  while (jsonUtf8Bytes(o) > MERCHANT_RAW_MAX_UTF8_BYTES) {
    if (typeof o.image_url === 'string' && o.image_url.length > IMAGE_URL_MAX_LEN) {
      o.image_url = shortenUrlForStorage(o.image_url, IMAGE_URL_MAX_LEN)
      continue
    }
    if (Array.isArray(o.features) && o.features.length) {
      o.features = (o.features as unknown[]).slice(0, Math.max(0, (o.features as unknown[]).length - 2))
      continue
    }
    if (typeof o.title === 'string' && o.title.length > 160) {
      o.title = truncateStr(o.title, 160)
      continue
    }
    if (o.price != null && typeof o.price === 'object' && !Array.isArray(o.price)) {
      delete o.price
      continue
    }
    delete o.features
    if (typeof o.title === 'string')
      o.title = truncateStr(o.title, 80)
    if (jsonUtf8Bytes(o) <= MERCHANT_RAW_MAX_UTF8_BYTES) break
    delete o.image_url
    o._clamped_for_d1 = true
    break
  }
  return o
}

/**
 * Whitelist for `amazon_merchant_raw`: title, ASIN, main `image_url`, `features`, `price` snapshot.
 */
export function sanitizeMerchantRawForStorage(item: Record<string, unknown>): Record<string, unknown> {
  const asin = String(item.asin ?? item.data_asin ?? '').trim()

  const mainImg = String(item.image_url ?? '').trim()
  const priceSrc = item.price as Record<string, unknown> | undefined

  const price: Record<string, unknown> = {}
  if (priceSrc && typeof priceSrc === 'object') {
    if (priceSrc.current !== undefined) price.current = priceSrc.current
    if (priceSrc.display_price !== undefined) price.display_price = priceSrc.display_price
  }
  const cur = item.currency
  if (cur !== undefined && cur !== null && String(cur).trim() !== '')
    price.currency = cur

  const out: Record<string, unknown> = {
    title: truncateStr(String(item.title ?? ''), 450),
    asin: asin || undefined,
    image_url: mainImg ? shortenUrlForStorage(mainImg, IMAGE_URL_MAX_LEN) : undefined,
    features: toFeatures(item).map((f) => truncateStr(f, 280)).slice(0, 12),
    price: Object.keys(price).length ? price : undefined,
  }

  for (const k of Object.keys(out)) {
    if (out[k] === undefined) delete out[k]
  }

  if (jsonUtf8Bytes(out) <= MERCHANT_RAW_MAX_UTF8_BYTES) return out

  const lean: Record<string, unknown> = { ...out }
  lean.features = (lean.features as string[])?.slice(0, 4) ?? []
  lean.title = truncateStr(String(lean.title ?? ''), 200)
  let bytes = jsonUtf8Bytes(lean)
  while (bytes > MERCHANT_RAW_MAX_UTF8_BYTES && Array.isArray(lean.features) && (lean.features as string[]).length > 0) {
    ;(lean.features as string[]).pop()
    bytes = jsonUtf8Bytes(lean)
  }
  if (bytes > MERCHANT_RAW_MAX_UTF8_BYTES) {
    lean._storage_note = 'truncated_for_d1_row_size'
    delete lean.features
    lean.image_url = mainImg ? shortenUrlForStorage(mainImg, IMAGE_URL_MAX_LEN) : lean.image_url
  }
  return lean
}

/**
 * Ranking, dedupe, and limit logic from DataForSEO + n8n reference workflow.
 */
export function buildMerchantOffersFromRawItems(
  ctx: MerchantOfferSlotBuildContext,
): MerchantSlotBuildOutcome {
  const limit = Math.max(1, Math.min(20, Number(ctx.fetchAsinLimit || 5)))

  const existingAsinSet = new Set<string>()
  for (const row of ctx.existingOffers) {
    const asin = String(row?.amazon?.asin ?? '').trim()
    if (asin) existingAsinSet.add(asin)
  }
  const existingForCategory = ctx.existingOffers.length

  if (!ctx.force && normalize(ctx.seedStatusLower) === 'fetched') {
    return {
      ...ctx,
      limit,
      existing_for_category: existingForCategory,
      candidate_pool_size: 0,
      create_items: [],
      create_count: 0,
      total_for_category: existingForCategory,
      mark_fetched: true,
      reason: 'already_fetched',
    }
  }

  if (!ctx.ready) {
    return {
      ...ctx,
      limit,
      existing_for_category: existingForCategory,
      candidate_pool_size: 0,
      create_items: [],
      create_count: 0,
      total_for_category: existingForCategory,
      mark_fetched: false,
      reason: 'task_not_ready',
    }
  }

  const items = Array.isArray(ctx.rawItems) ? ctx.rawItems : []
  const seedTokens = normalize(ctx.seedInput || ctx.category || '')
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length > 2)

  type Ranked = {
    item: Record<string, unknown>
    idx: number
    asin: string
    rating: number
    votes: number
    bought: number
    matchRatio: number
  }

  const withRank: Ranked[] = items.map((raw, i) => {
    const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
      string,
      unknown
    >
    const title = String(item?.title ?? '')
    const titleNorm = normalize(title)
    const matched = seedTokens.filter((t) => titleNorm.includes(t)).length
    const matchRatio = seedTokens.length ? matched / seedTokens.length : 0
    const ratingObj = item.rating as { value?: unknown; votes_count?: unknown } | undefined
    const rating = Number((ratingObj?.value as number) || 0)
    const votes = Number((ratingObj?.votes_count as number) || 0)
    const bought = Number(item?.bought_past_month ?? 0)
    const asin = String(item?.asin ?? item?.data_asin ?? '').trim()
    return { item, idx: i, asin, rating, votes, bought, matchRatio }
  })

  withRank.sort((a, b) => {
    if (a.rating !== b.rating) return b.rating - a.rating
    if (a.votes !== b.votes) return b.votes - a.votes
    if (a.bought !== b.bought) return b.bought - a.bought
    if (a.matchRatio !== b.matchRatio) return b.matchRatio - a.matchRatio
    return a.idx - b.idx
  })

  const candidatePool = withRank.slice(0, Math.min(withRank.length, 100))
  const need = Math.max(0, limit - existingForCategory)
  const createItems: MerchantOfferCreatePatch[] = []
  const localSeen = new Set<string>()

  for (const entry of candidatePool) {
    if (createItems.length >= need) break
    const asin = entry.asin
    if (!asin) continue
    if (existingAsinSet.has(asin)) continue
    if (localSeen.has(asin)) continue
    localSeen.add(asin)

    const item = entry.item
    const primaryImage =
      (item.image_url as string) ||
      (Array.isArray(item.product_images_list)
        ? (item.product_images_list[0] as string)
        : '') ||
      ''

    const priceMajor = resolvePriceMajor(item)
    const now = new Date().toISOString()
    createItems.push({
      title: String(item.title || `Amazon ${asin}`),
      slug: `amazon-${asin.toLowerCase()}`,
      status: 'active',
      amazon: {
        asin,
        currency: 'USD',
        ratingAvg:
          entry.rating > 0 ? entry.rating : undefined,
        reviewCount:
          entry.votes > 0 ? Math.round(entry.votes) : undefined,
        priceCents: priceMajor !== undefined ? moneyToCents(priceMajor) : undefined,
        imageUrl: primaryImage || undefined,
        merchantRaw: sanitizeMerchantRawForStorage(item),
        dfsSnapshot: buildDfsSnapshotForStorage(item),
        merchantLastSyncedAt: now,
      },
    })
  }

  const totalForCategory = existingForCategory + createItems.length
  const markFetched = totalForCategory >= limit
  let reason: MerchantSlotBuildOutcome['reason'] = 'ok'
  if (markFetched) reason = 'ok'
  else if (candidatePool.length) reason = 'insufficient_candidates'
  else reason = 'no_products'

  return {
    ...ctx,
    limit,
    existing_for_category: existingForCategory,
    candidate_pool_size: candidatePool.length,
    create_items: createItems,
    create_count: createItems.length,
    total_for_category: totalForCategory,
    mark_fetched: markFetched,
    reason,
  }
}
