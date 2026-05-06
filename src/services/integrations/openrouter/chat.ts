const DEFAULT_BASE = 'https://openrouter.ai/api/v1'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

type ChatInit = {
  signal?: AbortSignal
  responseFormatJson?: boolean
  temperature?: number
  maxTokens?: number
}

export type OpenRouterChatResult = {
  text: string
  finishReason: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    /** OpenRouter: USD charged for this call when present */
    cost?: number
  }
  /** Full JSON body for cost / extended usage fields */
  raw?: unknown
}

export async function openrouterChat(
  model: string,
  messages: ChatMessage[],
  init?: ChatInit,
): Promise<string> {
  const r = await openrouterChatWithMeta(model, messages, init)
  return r.text
}

/**
 * Returns assistant text and finish_reason (e.g. `length` when truncated) for post-processing.
 */
export async function openrouterChatWithMeta(
  model: string,
  messages: ChatMessage[],
  init?: ChatInit,
): Promise<OpenRouterChatResult> {
  const key = process.env.OPENAI_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim()
  if (!key) {
    throw new Error('Set OPENAI_API_KEY or OPENROUTER_API_KEY for OpenRouter')
  }
  const base = (process.env.OPENAI_BASE_URL || process.env.OPENROUTER_BASE_URL || DEFAULT_BASE).replace(
    /\/$/,
    '',
  )
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: init?.temperature ?? 0.4,
      ...(init?.maxTokens != null && init.maxTokens > 0
        ? { max_tokens: init.maxTokens }
        : {}),
      ...(init?.responseFormatJson
        ? { response_format: { type: 'json_object' } }
        : {}),
    }),
    signal: init?.signal,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${t.slice(0, 500)}`)
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[]
    usage?: OpenRouterChatResult['usage']
  }
  const ch = data.choices?.[0]
  const text = ch?.message?.content
  if (!text) {
    throw new Error('OpenRouter: empty response')
  }
  return { text, finishReason: ch?.finish_reason ?? '', usage: data.usage, raw: data }
}
