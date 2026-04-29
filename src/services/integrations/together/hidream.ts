const DEFAULT_BASE = 'https://api.together.xyz/v1'

export type TogetherImageResult = { url: string; revised_prompt?: string }

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
