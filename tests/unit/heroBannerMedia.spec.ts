import { describe, expect, it } from 'vitest'

import { defaultAmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import type { SiteBlueprint } from '@/payload-types'
import {
  applyHeroBannerToAmzSiteConfig,
  composeHeroBannerPromptFromSiteBlueprint,
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

  it('composeHeroBannerPromptFromSiteBlueprint pulls hero lines from blueprint', () => {
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
    expect(prompt).toContain('Ultimate Gadgets')
    expect(prompt).toContain('Buying guides')
    expect(prompt.toLowerCase()).toContain('kitchen tools')
    expect(prompt).toContain('test-site')
  })
})
