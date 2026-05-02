import { describe, expect, it } from 'vitest'

import {
  AMZ_DESIGN_FILLABLE_DOT_PATHS,
  applyAllowedFillPatches,
  buildFlatFillSkeletonPlaceholderJson,
  parseFillSlotsPatch,
} from '@/utilities/amzTemplateDesign/amzDesignFillablePaths'
import {
  buildFillSlotsUserPrompt,
  buildSystemPrompt,
} from '@/utilities/amzTemplateDesign/runAmzTemplateDesignForSite'
import { defaultAmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import type { AmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'

describe('amzDesignFillablePaths', () => {
  it('whitelist includes theme color and font stacks for flat-patch mode', () => {
    expect(AMZ_DESIGN_FILLABLE_DOT_PATHS).toContain('theme.colors.light.primary')
    expect(AMZ_DESIGN_FILLABLE_DOT_PATHS).toContain('theme.colors.dark.background')
    expect(AMZ_DESIGN_FILLABLE_DOT_PATHS).toContain('fonts.sans')
    expect(AMZ_DESIGN_FILLABLE_DOT_PATHS).toContain('fonts.mono')
  })

  it('buildFlatFillSkeletonPlaceholderJson lists every whitelist key', () => {
    const sk = buildFlatFillSkeletonPlaceholderJson()
    expect(Object.keys(sk).sort()).toEqual([...AMZ_DESIGN_FILLABLE_DOT_PATHS].sort())
    expect(Object.values(sk).every((v) => v === '__FILL_EN__')).toBe(true)
  })

  it('parseFillSlotsPatch accepts flat whitelist keys only', () => {
    const flat = parseFillSlotsPatch({
      'homepage.hero.title': 'T1',
      'illegal.path': 'nope',
      'brand.logo.icon': 'Yoga',
    })
    expect(flat['homepage.hero.title']).toBe('T1')
    expect(flat['illegal.path']).toBeUndefined()
    expect(flat['brand.logo.icon']).toBeUndefined()
  })

  it('parseFillSlotsPatch reads nested whitelist leaves', () => {
    const flat = parseFillSlotsPatch({
      homepage: {
        hero: {
          title: 'From nested',
        },
      },
    })
    expect(flat['homepage.hero.title']).toBe('From nested')
  })

  it('applyAllowedFillPatches mutates nested strings only for whitelist', () => {
    const cfg = structuredClone(defaultAmzSiteConfig) as AmzSiteConfig
    cfg.navigation.main = [{ label: 'Lock', href: '/' }]
    const origNav = structuredClone(cfg.navigation.main)
    cfg.homepage.categories.items = [{ name: 'A', slug: 'a', description: '', icon: 'x' }]
    const origCatItems = structuredClone(cfg.homepage.categories.items)

    const wrote = applyAllowedFillPatches(cfg, {
      'homepage.hero.title': 'Hero X',
      'navigation.main': 'evil',
      'homepage.categories.items': 'evil',
      'homepage.categories.title': 'Categories X',
    })
    expect(wrote).toBe(2)
    expect(cfg.homepage.hero.title).toBe('Hero X')
    expect(cfg.homepage.categories.title).toBe('Categories X')
    expect(cfg.navigation.main).toEqual(origNav)
    expect(cfg.homepage.categories.items).toEqual(origCatItems)
  })

  it('applyAllowedFillPatches writes theme and font whitelist paths', () => {
    const cfg = structuredClone(defaultAmzSiteConfig) as AmzSiteConfig
    const accent = cfg.theme.colors.light.accent
    const origMono = cfg.fonts.mono
    const wrote = applyAllowedFillPatches(cfg, {
      'theme.colors.light.primary': 'oklch(0.45 0.12 250)',
      'fonts.sans': 'ui-sans-serif, system-ui, sans-serif',
    })
    expect(wrote).toBe(2)
    expect(cfg.theme.colors.light.primary).toBe('oklch(0.45 0.12 250)')
    expect(cfg.fonts.sans).toBe('ui-sans-serif, system-ui, sans-serif')
    expect(cfg.theme.colors.light.accent).toBe(accent)
    expect(cfg.fonts.mono).toBe(origMono)
  })
})

describe('AMZ prompt modes', () => {
  it('increment system mentions deep-merge, contrast, and theme guidance', () => {
    const s = buildSystemPrompt(false)
    expect(s).toContain('deep-merged')
    expect(s).toMatch(/oklch/i)
    expect(s).toMatch(/readability/i)
    expect(s).toMatch(/fonts\.sans|Fonts \(fonts/i)
  })

  it('fill system mentions FILL-SLOTS flat output and theme/font string rules', () => {
    const s = buildSystemPrompt(true)
    expect(s).toContain('FILL-SLOTS')
    expect(s).toContain('flat JSON')
    expect(s).toMatch(/oklch/i)
    expect(s).toMatch(/fonts\.sans|Fonts:/i)
  })

  it('fill user prompt excludes full merged config blob', () => {
    const p = buildFillSlotsUserPrompt({
      mainProduct: 'yoga mat',
      canonicalSiteName: 'Demo',
      canonicalSiteDomain: 'demo.com',
      nicheJson: '{}',
      variationSeed: 'seed-1',
    })
    expect(p).toContain('variation_seed: seed-1')
    expect(p).toContain('Allowed dot-path keys')
    expect(p).not.toContain('Current merged siteConfig')
  })
})
