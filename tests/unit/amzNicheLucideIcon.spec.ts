import { describe, expect, it } from 'vitest'

import {
  defaultAmzSiteConfig,
  type AmzSiteConfig,
} from '@/site-layouts/amz-template-1/defaultSiteConfig'
import {
  buildDomainLucideHints,
  coerceBrandLogoLucideForNiche,
  suggestLucideLogoIconFromNiche,
} from '@/utilities/amzNicheLucideIcon'

function cloneConfig(): AmzSiteConfig {
  return structuredClone(defaultAmzSiteConfig) as unknown as AmzSiteConfig
}

describe('amzNicheLucideIcon', () => {
  it('suggestLucideLogoIconFromNiche picks Activity for yoga mat', () => {
    expect(suggestLucideLogoIconFromNiche('premium yoga mat', {})).toBe('Activity')
  })

  it('suggestLucideLogoIconFromNiche reads niche JSON (kitchen → ChefHat)', () => {
    expect(suggestLucideLogoIconFromNiche('', { topic: 'kitchen gear' })).toBe('ChefHat')
  })

  it('suggestLucideLogoIconFromNiche uses primaryDomain compound label (yogamatguide → Activity)', () => {
    expect(suggestLucideLogoIconFromNiche('', {}, 'https://www.YogaMatGuide.com/foo')).toBe(
      'Activity',
    )
  })

  it('buildDomainLucideHints orders compounds before singles', () => {
    const hints = buildDomainLucideHints('yogamatguide.org')
    expect(hints[0]).toContain('yoga')
    expect(hints.some((p) => p.includes('sport') || p.includes('guide site'))).toBe(true)
  })

  it('coerceBrandLogoLucideForNiche replaces placeholder Image when niche matches', () => {
    const cfg = cloneConfig()
    cfg.brand!.logo!.type = 'lucide'
    cfg.brand!.logo!.icon = 'Image'
    coerceBrandLogoLucideForNiche(cfg, 'yoga essentials', {})
    expect(cfg.brand!.logo!.type).toBe('lucide')
    expect(cfg.brand!.logo!.icon).toBe('Activity')
    expect(cfg.brand!.logo!.svgPath).toBe('')
    expect(cfg.brand!.logo!.imagePath).toBe('')
  })

  it('coerceBrandLogoLucideForNiche does not override raster logo with imagePath', () => {
    const cfg = cloneConfig()
    cfg.brand!.logo!.type = 'image'
    cfg.brand!.logo!.icon = 'Image'
    cfg.brand!.logo!.imagePath = 'https://example.com/logo.png'
    coerceBrandLogoLucideForNiche(cfg, 'yoga mat', {})
    expect(cfg.brand!.logo!.type).toBe('image')
    expect(cfg.brand!.logo!.imagePath).toBe('https://example.com/logo.png')
    expect(cfg.brand!.logo!.icon).toBe('Image')
  })

  it('coerceBrandLogoLucideForNiche replaces Home when domain narrows niche', () => {
    const cfg = cloneConfig()
    cfg.brand!.logo!.type = 'lucide'
    cfg.brand!.logo!.icon = 'Home'
    coerceBrandLogoLucideForNiche(cfg, '', {}, 'yogamatguide.com')
    expect(cfg.brand!.logo!.icon).toBe('Activity')
  })

  it('coerceBrandLogoLucideForNiche keeps Home when domain gives no peels', () => {
    const cfg = cloneConfig()
    cfg.brand!.logo!.icon = 'Home'
    coerceBrandLogoLucideForNiche(cfg, '', {}, undefined)
    expect(cfg.brand!.logo!.icon).toBe('Home')
  })

  it('coerceBrandLogoLucideForNiche keeps non-placeholder PascalCase icons', () => {
    const cfg = cloneConfig()
    cfg.brand!.logo!.type = 'lucide'
    cfg.brand!.logo!.icon = 'Zap'
    coerceBrandLogoLucideForNiche(cfg, 'generic gadgets', {})
    expect(cfg.brand!.logo!.type).toBe('lucide')
    expect(cfg.brand!.logo!.icon).toBe('Zap')
  })

  it('coerceBrandLogoLucideForNiche replaces invalid icon names', () => {
    const cfg = cloneConfig()
    cfg.brand!.logo!.icon = 'not-pascal-case'
    coerceBrandLogoLucideForNiche(cfg, 'kitchen tools', {})
    expect(cfg.brand!.logo!.icon).toBe('ChefHat')
  })

  it('coerceBrandLogoLucideForNiche fills missing logo', () => {
    const cfg = cloneConfig()
    delete (cfg.brand as { logo?: unknown }).logo
    coerceBrandLogoLucideForNiche(cfg, 'running shoes', {})
    expect(cfg.brand!.logo!.type).toBe('lucide')
    expect(cfg.brand!.logo!.icon).toBeTruthy()
    expect(cfg.brand!.logo!.svgPath).toBe('')
    expect(cfg.brand!.logo!.imagePath).toBe('')
  })
})
