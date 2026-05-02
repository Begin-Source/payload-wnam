const DEFAULT_BASE = 'https://api.together.xyz/v1'

export type TogetherImageResult = { url: string; revised_prompt?: string }

export type TogetherImageBytesResult = {
  buffer: Uint8Array
  mimeType: string
}

/** Optional Together image dimensions in request body (pairs override env default 1024 square). */
export type TogetherImageDimsInit = { width?: number; height?: number }

/** Together OpenAPI: width/height 1024 unless `TOGETHER_IMAGE_USE_SIZE=0`; override via init width/height. */
function explicitDimensions(init?: TogetherImageDimsInit): { width?: number; height?: number } {
  const w = init?.width
  const h = init?.height
  if (
    typeof w === 'number' &&
    Number.isFinite(w) &&
    typeof h === 'number' &&
    Number.isFinite(h) &&
    Math.floor(w) >= 64 &&
    Math.floor(h) >= 64
  ) {
    return { width: Math.floor(w), height: Math.floor(h) }
  }
  return {}
}

/** Together OpenAPI: default square 1024 (omit entirely when disabled). */
function bodyDimensions(include: boolean): { width?: number; height?: number } {
  if (!include) return {}
  return { width: 1024, height: 1024 }
}

function dimensionsForRequest(
  useSizeEnv: boolean,
  init?: TogetherImageDimsInit,
): { width?: number; height?: number } {
  const explicit = explicitDimensions(init)
  if ('width' in explicit && explicit.width != null) return explicit
  return bodyDimensions(useSizeEnv)
}

function optionalStepsFromEnv(): { steps?: number } {
  const raw = process.env.TOGETHER_IMAGE_STEPS?.trim()
  if (!raw) return {}
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return {}
  return { steps: Math.floor(n) }
}

/**
 * Image generation (Together). Model name can be FLUX, HiDream, etc. from env.
 * Request shape follows Together POST /images/generations OpenAPI (`width`/`height`, no `size` string).
 */
export async function togetherImageGenerate(
  prompt: string,
  init?: { model?: string; signal?: AbortSignal } & TogetherImageDimsInit,
): Promise<TogetherImageResult> {
  const key = process.env.TOGETHER_API_KEY?.trim()
  if (!key) {
    throw new Error('TOGETHER_API_KEY is not set')
  }
  const base = (process.env.TOGETHER_BASE_URL || DEFAULT_BASE).replace(/\/$/, '')
  const model =
    init?.model ||
    process.env.TOGETHER_IMAGE_MODEL?.trim() ||
    'black-forest-labs/FLUX.1-schnell-Free'
  const useSize = process.env.TOGETHER_IMAGE_USE_SIZE !== '0'

  const res = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      ...optionalStepsFromEnv(),
      ...dimensionsForRequest(useSize, init),
    }),
    signal: init?.signal,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Together image ${res.status}: ${t.slice(0, 500)}`)
  }
  const data = (await res.json()) as { data?: { url?: string }[] }
  const url = data.data?.[0]?.url
  if (!url) {
    throw new Error('Together: no image url')
  }
  return { url }
}

type TogetherImagesJson = {
  data?: Array<{ b64_json?: string; mime_type?: string; url?: string }>
  message?: string
  error?: { message?: string }
}

function extFromMime(mime: string): string {
  const m = mime.toLowerCase()
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg'
  if (m.includes('webp')) return 'webp'
  if (m.includes('png')) return 'png'
  if (m.includes('gif')) return 'gif'
  return 'jpg'
}

/**
 * Base64 pipeline (Together POST /images/generations).
 * Uses `response_format: base64` (OpenAPI enum). Response items still expose `b64_json` per schema.
 * Set `TOGETHER_IMAGE_USE_SIZE=0` to omit width/height for models that reject explicit dimensions.
 * Set `TOGETHER_IMAGE_STEPS` to send `steps`; omit otherwise (Flux-only; many models reject it).
 */
export async function togetherImageGenerateBytes(
  prompt: string,
  init?: { model?: string; signal?: AbortSignal } & TogetherImageDimsInit,
): Promise<TogetherImageBytesResult> {
  const key = process.env.TOGETHER_API_KEY?.trim()
  if (!key) {
    throw new Error('TOGETHER_API_KEY is not set')
  }
  const base = (process.env.TOGETHER_BASE_URL || DEFAULT_BASE).replace(/\/$/, '')
  const model =
    init?.model ||
    process.env.TOGETHER_IMAGE_MODEL?.trim() ||
    'black-forest-labs/FLUX.1-schnell-Free'

  const useSize = process.env.TOGETHER_IMAGE_USE_SIZE !== '0'
  const body: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    response_format: 'base64',
    ...optionalStepsFromEnv(),
    ...dimensionsForRequest(useSize, init),
  }

  const res = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: init?.signal,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Together image ${res.status}: ${t.slice(0, 500)}`)
  }
  const data = (await res.json()) as TogetherImagesJson
  const first = Array.isArray(data.data) ? data.data[0] : null
  const b64 = typeof first?.b64_json === 'string' ? first.b64_json.trim() : ''
  if (b64) {
    let buffer: Buffer
    try {
      buffer = Buffer.from(b64, 'base64')
    } catch {
      throw new Error('Together: invalid b64_json')
    }
    if (!buffer.length) {
      throw new Error('Together: empty b64 decode')
    }
    const mimeRaw = typeof first.mime_type === 'string' ? first.mime_type.trim() : ''
    const mimeType = mimeRaw || 'image/jpeg'
    return { buffer: new Uint8Array(buffer), mimeType }
  }

  const url = typeof first?.url === 'string' ? first.url : undefined
  if (typeof url === 'string' && url.startsWith('http')) {
    const imgRes = await fetch(url)
    if (!imgRes.ok) {
      throw new Error(`Together image download ${imgRes.status}`)
    }
    const mimeType = imgRes.headers.get('content-type') ?? 'image/png'
    const buf = new Uint8Array(await imgRes.arrayBuffer())
    return { buffer: buf, mimeType }
  }

  const apiErr =
    typeof data?.error?.message === 'string'
      ? data.error.message
      : typeof data?.message === 'string'
        ? data.message
        : null
  throw new Error(`Together: no image b64 or url${apiErr ? `: ${apiErr}` : ''}`)
}

export function imageExtensionFromMime(mimeType: string): string {
  return extFromMime(mimeType)
}
