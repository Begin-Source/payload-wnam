import { describe, expect, it } from 'vitest'

import { parseOpenRouterModelListTimeoutMs } from '@/utilities/openRouterGenerationModels'

describe('parseOpenRouterModelListTimeoutMs', () => {
  it('defaults to 8000 when unset or invalid', () => {
    expect(parseOpenRouterModelListTimeoutMs(undefined)).toBe(8000)
    expect(parseOpenRouterModelListTimeoutMs('')).toBe(8000)
    expect(parseOpenRouterModelListTimeoutMs('  ')).toBe(8000)
    expect(parseOpenRouterModelListTimeoutMs('abc')).toBe(8000)
    expect(parseOpenRouterModelListTimeoutMs('500')).toBe(8000)
  })

  it('accepts integers in 1000–120000', () => {
    expect(parseOpenRouterModelListTimeoutMs('1000')).toBe(1000)
    expect(parseOpenRouterModelListTimeoutMs('15000')).toBe(15000)
    expect(parseOpenRouterModelListTimeoutMs('120000')).toBe(120000)
  })

  it('clamps above max', () => {
    expect(parseOpenRouterModelListTimeoutMs('200000')).toBe(120000)
  })
})
