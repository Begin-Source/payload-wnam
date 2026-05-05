import { describe, expect, it } from 'vitest'

import {
  TOGETHER_ARTICLE_FEATURED_IMAGE_PROMPT,
  TOGETHER_HERO_BANNER_NEGATIVE,
  TOGETHER_SITE_LOGO_PROMPT,
} from '@/utilities/domainGeneration/promptKeys'
import { makeFeaturedImagePrompt } from '@/app/api/pipeline/lib/articlePipelineChain'
import { makeCategoryCoverImagePrompt } from '@/utilities/categoryCoverMedia'
import { heroBannerImageNegativePrompt, makeHeroBannerImagePrompt } from '@/utilities/heroBannerMedia'
import { pickTenantPromptPart } from '@/utilities/openRouterTenantPrompts/loadTenantPromptTemplateBody'
import { makeSiteLogoImagePrompt } from '@/utilities/siteLogoMedia'
import { DEFAULT_TOGETHER_IMAGE_PROMPT_SEED_BODIES } from '@/utilities/togetherTenantPrompts/defaultTogetherImagePromptBodies'
import {
  TOGETHER_ARTICLE_FEATURED_IMAGE_PROMPT_TEMPLATE,
  TOGETHER_CATEGORY_COVER_PROMPT_TEMPLATE,
  TOGETHER_HERO_BANNER_PROMPT_TEMPLATE,
  TOGETHER_SITE_LOGO_PROMPT_TEMPLATE,
  buildArticleFeaturedTogetherVars,
  buildCategoryCoverTogetherVars,
  buildHeroBannerTogetherVarsFromPromptParts,
  buildSiteLogoTogetherVarsFromPromptParts,
} from '@/utilities/togetherTenantPrompts/togetherImagePromptTemplates'

describe('Together tenant image prompt defaults', () => {
  it('site logo seed template + vars matches makeSiteLogoImagePrompt', () => {
    const parts = {
      siteName: 'My Shop',
      slugOrKey: 'my-shop',
      mainProduct: 'widgets',
      brandNameFromDesign: 'BrandCo',
    }
    const vars = buildSiteLogoTogetherVarsFromPromptParts(parts)
    const composed = makeSiteLogoImagePrompt({ ...parts, override: null })
    expect(pickTenantPromptPart(TOGETHER_SITE_LOGO_PROMPT_TEMPLATE, composed, vars)).toBe(composed)
    expect(DEFAULT_TOGETHER_IMAGE_PROMPT_SEED_BODIES[TOGETHER_SITE_LOGO_PROMPT]).toBe(
      TOGETHER_SITE_LOGO_PROMPT_TEMPLATE,
    )
  })

  it('hero banner seed template + vars matches makeHeroBannerImagePrompt', () => {
    const parts = {
      siteName: 'S',
      slugOrKey: 'slug',
      mainProduct: 'mp',
      nicheHint: 'niche hint text',
    }
    const vars = buildHeroBannerTogetherVarsFromPromptParts(parts)
    const composed = makeHeroBannerImagePrompt({ ...parts, override: null })
    expect(pickTenantPromptPart(TOGETHER_HERO_BANNER_PROMPT_TEMPLATE, composed, vars)).toBe(composed)
  })

  it('hero negative seed matches heroBannerImageNegativePrompt', () => {
    expect(DEFAULT_TOGETHER_IMAGE_PROMPT_SEED_BODIES[TOGETHER_HERO_BANNER_NEGATIVE]).toBe(
      heroBannerImageNegativePrompt(),
    )
  })

  it('category cover seed template + vars matches makeCategoryCoverImagePrompt', () => {
    const parts = {
      categoryName: 'Cat',
      slug: 'cat-slug',
      description: 'desc',
      siteName: 'Store',
    }
    const vars = buildCategoryCoverTogetherVars(parts)
    const composed = makeCategoryCoverImagePrompt({ ...parts, override: null })
    expect(pickTenantPromptPart(TOGETHER_CATEGORY_COVER_PROMPT_TEMPLATE, composed, vars)).toBe(composed)
  })

  it('category cover spacing when slug empty matches legacy join', () => {
    const parts = {
      categoryName: 'Cat',
      slug: '',
      description: null,
      siteName: null,
    }
    const vars = buildCategoryCoverTogetherVars(parts)
    const composed = makeCategoryCoverImagePrompt({ ...parts, override: null })
    expect(composed).toContain('Subject: "Cat".  Style:')
  })

  it('article featured seed template + vars matches makeFeaturedImagePrompt', () => {
    const args = { title: 'T', excerpt: 'ex', keywordTerm: 'kw' }
    const vars = buildArticleFeaturedTogetherVars(args)
    const composed = makeFeaturedImagePrompt(args)
    expect(pickTenantPromptPart(TOGETHER_ARTICLE_FEATURED_IMAGE_PROMPT_TEMPLATE, composed, vars)).toBe(
      composed,
    )
    expect(DEFAULT_TOGETHER_IMAGE_PROMPT_SEED_BODIES[TOGETHER_ARTICLE_FEATURED_IMAGE_PROMPT]).toBe(
      TOGETHER_ARTICLE_FEATURED_IMAGE_PROMPT_TEMPLATE,
    )
  })
})
