/** Normalizes DFS / Directus-compat postbacks into `{ tag, raw_items, ready, ... }`. */

export type NormalizedMerchantPostback = {
  tag: string
  task_id: string | null
  status_code: number
  status_message: string
  raw_items: unknown[]
  ready: boolean
}

function norm(s: string): string {
  let v = String(s ?? '').trim().replace(/^\ufeff/, '')
  try {
    v = decodeURIComponent(v)
  } catch {
    /* ignore */
  }
  return v.trim()
}

/**
 * Mirrors n8n `PB | Validate Postback`: token from URL / header / body, then DFS `tasks[0]`.
 */
export function normalizeDataForSeoMerchantPostback(
  body: unknown,
  headers: Headers,
  url?: URL | null,
): NormalizedMerchantPostback {
  let token = ''
  if (url) {
    token = norm(url.searchParams.get('token') ?? '')
  }

  const hdrKey = [...headers.keys()].find((k) => k.toLowerCase() === 'x-postback-token')
  if (!token && hdrKey) {
    token = norm(String(headers.get(hdrKey) ?? '').split(',')[0])
  }

  let root: unknown = body
  if (root === undefined || root === null) root = {}
  if (typeof root === 'string') {
    try {
      root = JSON.parse(root) as unknown
    } catch {
      root = { raw: root }
    }
  }

  if (!token && root && typeof root === 'object' && !Array.isArray(root)) {
    const o = root as Record<string, unknown>
    token = norm(String(o.token ?? o.postback_token ?? ''))
  }

  const isUuidArray =
    Array.isArray(root) &&
    root.length > 0 &&
    typeof root[0] === 'string' &&
    String(root[0]).includes('-')

  const directusIds =
    root &&
    typeof root === 'object' &&
    !Array.isArray(root) &&
    Array.isArray((root as { seed_product_ids?: unknown }).seed_product_ids)
      ? (root as { seed_product_ids: string[] }).seed_product_ids
      : null
  const isDirectusSeedList =
    Array.isArray(directusIds) &&
    directusIds.length > 0 &&
    typeof directusIds[0] === 'string' &&
    directusIds[0].includes('-')

  const taskObj = Array.isArray(root)
    ? ((root[0] ?? {}) as Record<string, unknown>)
    : Array.isArray((root as { tasks?: unknown }).tasks)
      ? (((root as { tasks: unknown[] }).tasks[0] ?? {}) as Record<string, unknown>)
      : ((root ?? {}) as Record<string, unknown>)

  const looksLikeDfs =
    typeof taskObj.status_code !== 'undefined' || typeof taskObj.id !== 'undefined'

  const expected = process.env.OFFER_MERCHANT_POSTBACK_SECRET ?? 'dfs_postback_v1'

  if (token && token !== expected) {
    throw new Error('Invalid postback token (explicit token mismatch)')
  }

  if (!token && !looksLikeDfs && !isUuidArray && !isDirectusSeedList) {
    const info = Array.isArray(root) ? 'array' : Object.keys((root ?? {}) as object).join(',')
    throw new Error(`Invalid postback token. Received: ${info}`)
  }

  if (isUuidArray) {
    const id = String((root as unknown[])[0]).trim()
    return {
      tag: id,
      task_id: null,
      status_code: 20000,
      status_message: 'Directus trigger',
      raw_items: [],
      ready: true,
    }
  }

  if (isDirectusSeedList && directusIds) {
    const id = String(directusIds[0]).trim()
    return {
      tag: id,
      task_id: null,
      status_code: 20000,
      status_message: 'Directus trigger',
      raw_items: [],
      ready: true,
    }
  }

  const status_code = Number(taskObj.status_code ?? 0)
  const status_message = String(taskObj.status_message ?? '')
  const task_id = String(taskObj.id ?? '').trim() || null
  const tag = String(
    taskObj.tag ?? (taskObj.data as { tag?: string } | undefined)?.tag ?? '',
  ).trim()
  if (!tag) throw new Error('Missing tag in postback')

  const result = (Array.isArray(taskObj.result) ? taskObj.result[0] : {}) as Record<
    string,
    unknown
  >
  const raw_items = Array.isArray(result.items) ? result.items : []

  return {
    tag,
    task_id,
    status_code,
    status_message,
    raw_items,
    ready: status_code === 20000,
  }
}
