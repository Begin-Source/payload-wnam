import { describe, expect, it } from 'vitest'

import { loadAmzEligibilityThresholdsFromMerged } from '@/utilities/keywordEligibility'
import {
  mergePipelineProfileOntoGlobal,
  normalizeGlobalPipelineDoc,
  selectLlmModelForSection,
  type PipelineSettingShape,
} from '@/utilities/pipelineSettingShape'

const minimalGlobal = (): PipelineSettingShape =>
  normalizeGlobalPipelineDoc({
    tavilyEnabled: true,
    dataForSeoEnabled: true,
    togetherImageEnabled: true,
    defaultLlmModel: 'global/default',
    defaultImageModel: 'global/img',
    frugalMode: false,
    amzKeywordEligibility: { minVolume: 100, maxKd: 50 },
  })

describe('pipeline profile merge', () => {
  it('normalizeGlobalPipelineDoc treats missing flags as enabled defaults', () => {
    const n = normalizeGlobalPipelineDoc({})
    expect(n.tavilyEnabled).toBe(true)
    expect(n.dataForSeoEnabled).toBe(true)
    expect(n.togetherImageEnabled).toBe(true)
    expect(n.defaultLlmModel).toBeNull()
  })

  it('mergePipelineProfileOntoGlobal leaves base when profile empty', () => {
    const base = minimalGlobal()
    expect(mergePipelineProfileOntoGlobal(base, {})).toEqual(base)
    expect(mergePipelineProfileOntoGlobal(base, null)).toEqual(base)
  })

  it('merge overrides only set profile fields', () => {
    const base = minimalGlobal()
    const m = mergePipelineProfileOntoGlobal(base, { dataForSeoEnabled: false })
    expect(m.dataForSeoEnabled).toBe(false)
    expect(m.tavilyEnabled).toBe(true)
    expect(m.defaultLlmModel).toBe('global/default')
  })

  it('merge replaces JSON block when profile sets amzKeywordEligibility', () => {
    const base = minimalGlobal()
    const m = mergePipelineProfileOntoGlobal(base, {
      amzKeywordEligibility: { minVolume: 999, maxKd: 12 },
    })
    const t = loadAmzEligibilityThresholdsFromMerged(m)
    expect(t.minVolume).toBe(999)
    expect(t.maxKd).toBe(12)
  })

  it('selectLlmModelForSection prefers row for sectionType', () => {
    const merged = mergePipelineProfileOntoGlobal(minimalGlobal(), {
      llmModelsBySection: [
        { sectionType: 'intro', model: 'openrouter/intro-model' },
        { sectionType: 'faq', model: 'openrouter/faq' },
      ],
      defaultLlmModel: 'openrouter/fallback',
    })
    expect(selectLlmModelForSection(merged, 'intro')).toBe('openrouter/intro-model')
    expect(selectLlmModelForSection(merged, 'faq')).toBe('openrouter/faq')
  })

  it('selectLlmModelForSection falls back to default then literal fallback', () => {
    const merged = mergePipelineProfileOntoGlobal(minimalGlobal(), {
      defaultLlmModel: 'tenant/default',
    })
    expect(selectLlmModelForSection(merged, 'custom')).toBe('tenant/default')
    const bare = normalizeGlobalPipelineDoc({})
    expect(selectLlmModelForSection(bare, 'intro', 'hardcoded')).toBe('hardcoded')
  })
})
