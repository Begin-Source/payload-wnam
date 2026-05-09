import { describe, expect, it } from 'vitest'

import {
  PIPELINE_DEFAULT_OPENROUTER_LLM,
  replaceRegionBlockedOpenRouterModel,
} from '@/constants/pipelineOpenRouterModels'

describe('replaceRegionBlockedOpenRouterModel', () => {
  it('falls back to pipeline default for empty / region-sensitive providers', () => {
    expect(replaceRegionBlockedOpenRouterModel(undefined)).toBe(PIPELINE_DEFAULT_OPENROUTER_LLM)
    expect(replaceRegionBlockedOpenRouterModel(null)).toBe(PIPELINE_DEFAULT_OPENROUTER_LLM)
    expect(replaceRegionBlockedOpenRouterModel('')).toBe(PIPELINE_DEFAULT_OPENROUTER_LLM)
    expect(replaceRegionBlockedOpenRouterModel('  ')).toBe(PIPELINE_DEFAULT_OPENROUTER_LLM)
    expect(replaceRegionBlockedOpenRouterModel('openai/gpt-4o')).toBe(PIPELINE_DEFAULT_OPENROUTER_LLM)
    expect(replaceRegionBlockedOpenRouterModel('Anthropic/claude-3.5-sonnet')).toBe(
      PIPELINE_DEFAULT_OPENROUTER_LLM,
    )
  })

  it('keeps other provider routes unchanged', () => {
    expect(replaceRegionBlockedOpenRouterModel('deepseek/deepseek-chat')).toBe('deepseek/deepseek-chat')
    expect(replaceRegionBlockedOpenRouterModel('google/gemini-2.0-flash-001')).toBe(
      'google/gemini-2.0-flash-001',
    )
  })
})
