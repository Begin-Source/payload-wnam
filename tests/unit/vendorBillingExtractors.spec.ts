import { describe, expect, it, vi } from 'vitest'

import { extractDataForSeoCostUsd } from '@/services/integrations/dataforseo/extractDataForSeoCostUsd'
import {
  extractTavilyUsageCredits,
  tavilyCreditsToUsd,
} from '@/utilities/tavilyUsageCredits'

describe('extractDataForSeoCostUsd', () => {
  it('sums positive task costs', () => {
    const usd = extractDataForSeoCostUsd({
      tasks: [{ cost: 0.01 }, { cost: 0.0005 }],
    })
    expect(usd).toBeCloseTo(0.0105, 6)
  })

  it('returns 0 when tasks missing', () => {
    expect(extractDataForSeoCostUsd({ status_code: 20000 })).toBe(0)
    expect(extractDataForSeoCostUsd(null)).toBe(0)
  })

  it('ignores non-finite or absurd costs', () => {
    expect(
      extractDataForSeoCostUsd({
        tasks: [{ cost: -1 }, { cost: NaN }, { cost: 1e12 }, { cost: 0.02 }],
      }),
    ).toBeCloseTo(0.02, 6)
  })
})

describe('extractTavilyUsageCredits', () => {
  it('reads usage.credits as positive integer floor', () => {
    expect(extractTavilyUsageCredits({ usage: { credits: 3.7 } })).toBe(3)
  })

  it('returns null when missing or non-positive', () => {
    expect(extractTavilyUsageCredits({})).toBeNull()
    expect(extractTavilyUsageCredits({ usage: {} })).toBeNull()
    expect(extractTavilyUsageCredits({ usage: { credits: 0 } })).toBeNull()
  })
})

describe('tavilyCreditsToUsd', () => {
  it('uses default PAYG rate when env unset', () => {
    vi.stubEnv('TAVILY_USD_PER_CREDIT', '')
    expect(tavilyCreditsToUsd(10)).toBeCloseTo(0.08, 6)
    vi.unstubAllEnvs()
  })

  it('respects TAVILY_USD_PER_CREDIT', () => {
    vi.stubEnv('TAVILY_USD_PER_CREDIT', '0.01')
    expect(tavilyCreditsToUsd(5)).toBe(0.05)
    vi.unstubAllEnvs()
  })
})
