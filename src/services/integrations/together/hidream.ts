const DEFAULT_BASE = 'https://api.together.xyz/v1'

export type TogetherImageResult = { url: string; revised_prompt?: string }

export type TogetherImageBytesResult = {
  buffer: Uint8Array
  mimeType: string
}

/**
 * Image generation (Together). Model name can be FLUX, HiDream, etc. from env.
 */
export async function togetherImageGenerate(
  prompt: string,
  init?: { model?: string; signal?: AbortSignal },
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
  const res = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, prompt, n: 1, size: '1024x1024' }),
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
 * Prefer Together `response_format: b64_json` (aligns with HiDream pipelines, avoids ephemeral URL fetch).
 * Set `TOGETHER_IMAGE_USE_SIZE=0` if the model rejects `size` (e.g. some HiDream payloads).
 */
export async function togetherImageGenerateBytes(
  prompt: string,
  init?: { model?: string; signal?: AbortSignal },
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
    response_format: 'b64_json',
  }
  if (useSize) {
    body.size = '1024x1024'
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
