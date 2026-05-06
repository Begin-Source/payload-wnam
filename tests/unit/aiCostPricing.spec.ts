import { describe, expect, it } from 'vitest'

import {
  mergeOpenRouterUsage,
  resolveOpenRouterChargeUsd,
  resolveTogetherImageChargeUsd,
  TOGETHER_IMAGE_FIXED_USD,
} from '@/utilities/aiCostPricing'

describe('resolveOpenRouterChargeUsd', () => {
  it('prefers usage.cost when present', () => {
    const r = resolveOpenRouterChargeUsd({
      model: 'openai/gpt-4o-mini',
      usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.001234 },
      kind: 'draft_section',
    })
    expect(r.source).toBe('openrouter_usage_cost')
    expect(r.usd).toBeCloseTo(0.001234, 6)
  })

  it('estimates from tokens when cost is absent', () => {
    const r = resolveOpenRouterChargeUsd({
      model: 'openai/gpt-4o-mini',
      usage: { prompt_tokens: 1000, completion_tokens: 1000 },
      kind: 'draft_section',
    })
    expect(r.source).toBe('token_estimate')
    expect(r.usd).toBeGreaterThan(0)
  })

  it('uses kind fallback when model unknown and no usable tokens', () => {
    const r = resolveOpenRouterChargeUsd({
      model: 'vendor/unknown-model-xyz',
      kind: 'domain_audit',
    })
    expect(r.source).toBe('fixed_kind_fallback')
    expect(r.usd).toBeCloseTo(0.015, 6)
  })
})

describe('mergeOpenRouterUsage', () => {
  it('merges cost and counts from raw.usage', () => {
    const u = mergeOpenRouterUsage({ prompt_tokens: 1 }, { usage: { cost: 0.02, completion_tokens: 2 } })
    expect(u?.cost).toBe(0.02)
    expect(u?.prompt_tokens).toBe(1)
    expect(u?.completion_tokens).toBe(2)
  })
})

describe('resolveTogetherImageChargeUsd', () => {
  it('reads numeric cost from raw JSON', () => {
    const r = resolveTogetherImageChargeUsd({ raw: { cost: 0.03 }, kind: 'homepage_hero_auto' })
    expect(r.source).toBe('together_response_cost')
    expect(r.usd).toBe(0.03)
  })

  it('uses fixed estimate when raw has no usable cost field', () => {
    const r = resolveTogetherImageChargeUsd({ raw: { data: [{ b64_json: 'x' }] }, kind: 'x' })
    expect(r.source).toBe('together_fixed_estimate')
    expect(r.usd).toBe(TOGETHER_IMAGE_FIXED_USD)
  })
})
