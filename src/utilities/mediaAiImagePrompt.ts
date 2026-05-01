/** Mirrors n8n "Build Image Prompt" for Guides → Payload media (`aiImagePrompt` + `alt`). */

export type MediaAiPromptInput = {
  aiImagePrompt?: string | null
  alt?: string | null
}

export type MediaAiPromptOk = {
  skipped: false
  promptText: string
  source: 'image_prompt' | 'alt_fallback' | 'title_fallback_from_url_prompt'
}

export type MediaAiPromptSkipped = {
  skipped: true
  skipReason: string
}

export type MediaAiPromptOutcome = MediaAiPromptOk | MediaAiPromptSkipped

export function resolveMediaAiImagePrompt(row: MediaAiPromptInput): MediaAiPromptOutcome {
  const rawPrompt = typeof row.aiImagePrompt === 'string' ? row.aiImagePrompt.trim() : ''
  const title = typeof row.alt === 'string' ? row.alt.trim() : ''
  const fallback = title ? `thumbnail image for this blog title: ${title}` : ''
  const isUrlPrompt = /^https?:\/\//i.test(rawPrompt)
  const promptText = !rawPrompt || isUrlPrompt ? fallback : rawPrompt

  if (!promptText) {
    return { skipped: true, skipReason: 'empty_image_prompt_and_title' }
  }

  let source: MediaAiPromptOk['source']
  if (!rawPrompt || isUrlPrompt) {
    if (isUrlPrompt && rawPrompt) {
      source = 'title_fallback_from_url_prompt'
    } else if (!rawPrompt && title) {
      source = 'alt_fallback'
    } else {
      source = 'alt_fallback'
    }
  } else {
    source = 'image_prompt'
  }

  return { skipped: false, promptText, source }
}

export function truncateErrorMessage(msg: string, max = 500): string {
  const s = msg.replace(/\s+/g, ' ').trim()
  return s.length <= max ? s : `${s.slice(0, max)}…`
}
