import { describe, expect, it } from 'vitest'

import { defaultAmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import type { SiteBlueprint } from '@/payload-types'
import {
  applyHeroBannerToAmzSiteConfig,
  composeHeroBannerPromptFromSiteBlueprint,
  heroBannerImageNegativePrompt,
  makeHeroBannerImagePrompt,
} from '@/utilities/heroBannerMedia'

describe('heroBannerMedia', () => {
  it('applyHeroBannerToAmzSiteConfig adds and removes bannerImage', () => {
    const cfg = structuredClone(defaultAmzSiteConfig)
    const withUrl = applyHeroBannerToAmzSiteConfig(cfg, 'https://cdn.example/b.webp')
    const heroObj = withUrl?.homepage.hero as { bannerImage?: string }
    expect(heroObj.bannerImage).toBe('https://cdn.example/b.webp')
    const cleared = applyHeroBannerToAmzSiteConfig(withUrl, undefined)
    const h2 = cleared?.homepage.hero as { bannerImage?: string }
    expect(h2.bannerImage).toBeUndefined()
  })

  it('makeHeroBannerImagePrompt uses override verbatim', () => {
    expect(
      makeHeroBannerImagePrompt({
        siteName: 'Ignored',
        slugOrKey: 'x',
        override: 'Minimal flat abstract shapes only',
      }),
    ).toBe('Minimal flat abstract shapes only')
  })

  it('makeHeroBannerImagePrompt avoids website-mock wording and forbids typography in pixels', () => {
    const p = makeHeroBannerImagePrompt({
      siteName: 'Yoga Mat Guide',
      slugOrKey: 'yoga-mats',
      mainProduct: 'yoga mats',
      nicheHint: null,
      override: null,
    })
    expect(p.toLowerCase()).not.toContain('website hero')
    expect(p.toLowerCase()).toContain('no user interface')
    expect(p.toLowerCase()).toContain('full-bleed')
    expect(p.toLowerCase()).toContain('no typography')
  })

  it('heroBannerImageNegativePrompt enumerates UI and typography exclusions', () => {
    const n = heroBannerImageNegativePrompt()
    expect(n).toContain('typography')
    expect(n).toContain('navigation bar')
    expect(n).toContain('website screenshot')
  })

  it('composeHeroBannerPromptFromSiteBlueprint omits blueprint hero titles (no literal headline injection)', () => {
    const bp = {
      amzSiteConfigJson: {
        homepage: {
          hero: {
            title: 'Ultimate Gadgets',
            subtitle: 'Buying guides since 2020',
          },
        },
      },
    } as unknown as SiteBlueprint
    const prompt = composeHeroBannerPromptFromSiteBlueprint(
      { name: 'Test Site', slug: 'test-site', mainProduct: 'kitchen tools', nicheData: null },
      bp,
      null,
    )
    expect(prompt).not.toContain('Ultimate Gadgets')
    expect(prompt).not.toContain('Buying guides')
    expect(prompt.toLowerCase()).toContain('kitchen tools')
    expect(prompt).toContain('test-site')
    expect(prompt.toLowerCase()).not.toContain('website hero')
  })
})
