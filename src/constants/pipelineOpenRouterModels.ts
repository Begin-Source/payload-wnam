/**
 * Default OpenRouter route ids for writing pipeline when OpenAI/Anthropic are region-blocked.
 * Override anytime in Admin: Globals → Pipeline Settings, or per `pipeline-profiles`.
 */
export const PIPELINE_DEFAULT_OPENROUTER_LLM = 'deepseek/deepseek-v4-flash'
export const PIPELINE_FALLBACK_OPENROUTER_LLM = 'deepseek/deepseek-chat'

const REGION_BLOCKED_OPENROUTER_PREFIXES = ['openai/', 'anthropic/'] as const

/**
 * OpenRouter may reject some providers with HTTP 403 ("not available in your region").
 * Old DB rows often pin `llmModelsBySection.conclusion` to OpenAI/Anthropic; finalize would
 * still pick those unless we normalize here.
 */
export function replaceRegionBlockedOpenRouterModel(model: string | null | undefined): string {
  const m = typeof model === 'string' ? model.trim() : ''
  if (!m) return PIPELINE_DEFAULT_OPENROUTER_LLM
  const lower = m.toLowerCase()
  for (const p of REGION_BLOCKED_OPENROUTER_PREFIXES) {
    if (lower.startsWith(p)) return PIPELINE_DEFAULT_OPENROUTER_LLM
  }
  return m
}
