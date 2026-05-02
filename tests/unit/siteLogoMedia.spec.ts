import { describe, expect, it } from 'vitest'

import type { Site, SiteBlueprint } from '@/payload-types'
import { defaultAmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import {
  applySiteLogoToAmzSiteConfig,
  composeSiteLogoPromptFromSiteBlueprint,
  makeSiteLogoImagePrompt,
  publicUrlFromSiteLogo,
  siteLogoImageDimensions,
} from '@/utilities/siteLogoMedia'

describe('siteLogoMedia', () => {
  it('publicUrlFromSiteLogo reads populated media url', () => {
    const site = {
      siteLogo: { id: 1, url: 'https://cdn.example/logo.webp' },
    } as Pick<Site, 'siteLogo'>
    expect(publicUrlFromSiteLogo(site)).toBe('https://cdn.example/logo.webp')
  })

  it('publicUrlFromSiteLogo returns undefined when missing url', () => {
    expect(publicUrlFromSiteLogo({ siteLogo: { id: 1 } as Site['siteLogo'] })).toBeUndefined()
  })

  it('applySiteLogoToAmzSiteConfig overrides brand.logo image when URL present', () => {
    const cfg = structuredClone(defaultAmzSiteConfig)
    const next = applySiteLogoToAmzSiteConfig(cfg, 'https://cdn.example/m.webp')
    expect(next?.brand.logo.type).toBe('image')
    expect(next?.brand.logo.imagePath).toBe('https://cdn.example/m.webp')
    expect(next?.brand.logo.icon).toBe('')
    expect(next?.brand.logo.svgPath).toBe('')
    expect(next?.brand.name).toBe(cfg.brand.name)
  })

  it('applySiteLogoToAmzSiteConfig noop without URL', () => {
    const cfg = structuredClone(defaultAmzSiteConfig)
    expect(applySiteLogoToAmzSiteConfig(cfg, undefined)).toBe(cfg)
    expect(applySiteLogoToAmzSiteConfig(cfg, '')).toBe(cfg)
  })

  it('makeSiteLogoImagePrompt uses override verbatim', () => {
    expect(
      makeSiteLogoImagePrompt({
        siteName: 'Ignored',
        slugOrKey: 'x',
        override: 'Just a red square',
      }),
    ).toBe('Just a red square')
  })

  it('composeSiteLogoPromptFromSiteBlueprint mentions brand.name from blueprint', () => {
    const bp = {
      amzSiteConfigJson: { brand: { name: 'Acme Outlet' } },
    } as unknown as SiteBlueprint
    const prompt = composeSiteLogoPromptFromSiteBlueprint(
      { name: 'Test Site', slug: 'test-site', mainProduct: 'widgets' },
      bp,
      null,
    )
    expect(prompt.toLowerCase()).toContain('acme outlet')
    expect(prompt.toLowerCase()).toContain('widgets')
    expect(prompt).toContain('test-site')
  })

  it('siteLogoImageDimensions defaults to square 1024', () => {
    const prev = process.env.TOGETHER_SITE_LOGO_SIZE
    delete process.env.TOGETHER_SITE_LOGO_SIZE
    expect(siteLogoImageDimensions()).toEqual({ width: 1024, height: 1024 })
    process.env.TOGETHER_SITE_LOGO_SIZE = prev
  })
})
