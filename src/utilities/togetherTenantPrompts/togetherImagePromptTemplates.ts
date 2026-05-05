import type { Site, SiteBlueprint } from '@/payload-types'

import { substitutePromptPlaceholders } from '@/utilities/domainGeneration/substitutePromptPlaceholders'
import { mergeAmzSiteConfigFromRaw } from '@/site-layouts/amz-template-1/mergeAmzSiteConfig'

function brandNameFromBlueprint(blueprint: SiteBlueprint | null | undefined): string | null {
  if (!blueprint?.amzSiteConfigJson || typeof blueprint.amzSiteConfigJson !== 'object') {
    return null
  }
  const cfg = mergeAmzSiteConfigFromRaw(blueprint.amzSiteConfigJson)
  const n = cfg.brand?.name?.trim()
  return n ? n.slice(0, 120) : null
}

/** Mirrors `nicheSnippet` in `heroBannerMedia` (feed into hero prompt, then slice to 350). */
function nicheDataToHeroHint(raw: Site['nicheData']): string | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'string') {
    const t = raw.trim().slice(0, 600)
    return t || null
  }
  if (typeof raw === 'object') {
    try {
      const s = JSON.stringify(raw).slice(0, 600)
      return s || null
    } catch {
      return null
    }
  }
  return null
}

/** Same typography as `siteLogoMedia` (curly quotes around “photo backdrop”). */
export const TOGETHER_SITE_LOGO_PROMPT_TEMPLATE = [
  'Single isolated brand mark only: ultra-simple flat vector or geometric glyph, symmetric or centered logo — not a poster, screenshot, collage, framed picture, banner, scenery, lifestyle photo, mockup device, gradient \u201cphoto backdrop\u201d, vignette border, polaroid, or postcard layout.',
  'Plain flat background: pure white #FFFFFF strongly preferred OR one solid light neutral (#F5F5F5–#EEEEEE); no busy textures, sunset/sky/office scenes, wood floors, blurred bokeh.',
  'The mark occupies ~55–72% of the square canvas height with generous even padding (breathing room); centered; looks sharp when scaled down to 16×16 px favicon.',
  'Site: "{{site_quoted}}".{{key_part}}{{brand_line}}{{mp_line}}',
  'At most 3 flat colors excluding background; crisp edges; thick readable strokes; absolutely no gradients that mimic lighting/photorealism.',
  'No human faces/hands/full products; no glossy 3D render; no fine hairlines; no watermark; no slogan lines; no tiny illegible typography.',
  'PNG-style clarity; think app icon sheet / identity mark suitable for Shopify header favicon bundle.',
]
  .map((x) => x.trim())
  .join(' ')

export function buildSiteLogoTogetherVarsFromPromptParts(parts: {
  siteName: string
  slugOrKey: string
  mainProduct?: string | null
  brandNameFromDesign?: string | null
}): Record<string, string> {
  const site_quoted = parts.siteName.trim() || 'Store'
  const slug_trim = parts.slugOrKey.trim()
  const mp = parts.mainProduct?.trim() ?? ''
  const brand = parts.brandNameFromDesign?.trim() ?? ''
  const key_part = slug_trim ? ` Key: ${slug_trim}.` : ''
  const brand_line = brand ? ` Brand cue from design: "${brand.slice(0, 80)}".` : ''
  const mp_line = mp ? ` Subject hint only (abstract shape / symbol), not a literal photograph: ${mp.slice(0, 120)}.` : ''
  return {
    site_quoted,
    key_part,
    brand_line,
    mp_line,
  }
}

export function buildSiteLogoTogetherVars(
  site: Pick<Site, 'name' | 'slug' | 'mainProduct'> | null,
  blueprint: SiteBlueprint | null | undefined,
): Record<string, string> {
  const slug = typeof site?.slug === 'string' && site.slug.trim() ? site.slug.trim() : 'site'
  const name =
    typeof site?.name === 'string' && site.name.trim()
      ? site.name.trim()
      : typeof site?.slug === 'string'
        ? site.slug.trim()
        : 'Site'
  const mp = typeof site?.mainProduct === 'string' ? site.mainProduct : null
  const brand = brandNameFromBlueprint(blueprint)?.trim() ?? ''
  return buildSiteLogoTogetherVarsFromPromptParts({
    siteName: name,
    slugOrKey: slug,
    mainProduct: mp,
    brandNameFromDesign: brand || null,
  })
}

export const TOGETHER_HERO_BANNER_PROMPT_TEMPLATE = [
  'Wide cinematic landscape photograph or editorial illustration, panoramic wide aspect similar to 16:9, atmospheric depth, soft bokeh, natural full-bleed scene only; not a screenshot, not a webpage, not a composite layout, no user interface of any kind.',
  'Subject context for vibe only—do not render any part of the following as visible letters or logos in the image. Brand or site identity (mood only): {{site_quoted}}.{{hero_key_part}}{{mp_suffix}}{{niche_suffix}}',
  'Style: premium editorial photography or tasteful illustration; unobtrusive, cohesive cool or warm palette suitable behind a separate HTML text overlay (the overlay is not part of this render).',
  'Calm central readability via soft gradients and atmospheric haze only—absolutely no typography inside pixels.',
  'No logos, captions, storefront signage, device screens with readable UI, hashtags, watermarks, instructional diagrams with text.',
  'Single continuous scene; avoid collage, storyboard, browser frames, or mock-ups.',
]
  .map((x) => x.trim())
  .join(' ')

export function buildHeroBannerTogetherVarsFromPromptParts(parts: {
  siteName: string
  slugOrKey: string
  mainProduct?: string | null
  nicheHint?: string | null
}): Record<string, string> {
  const site_quoted = parts.siteName.trim() || 'Store'
  const slug_trim = parts.slugOrKey.trim()
  const hero_key_part = slug_trim ? ` Key: ${slug_trim}.` : ''
  const mp = parts.mainProduct?.trim() ?? ''
  const mp_suffix = mp ? ` Primary product/context: ${mp.slice(0, 200)}.` : ''
  const nh = parts.nicheHint?.trim()
  const niche_suffix = nh
    ? ` Niche hint (non-literal, no labels to paint): ${nh.slice(0, 350)}`
    : ''
  return {
    site_quoted,
    hero_key_part,
    mp_suffix,
    niche_suffix,
  }
}

export function buildHeroBannerTogetherVars(
  site: Pick<Site, 'name' | 'slug' | 'mainProduct' | 'nicheData'> | null,
): Record<string, string> {
  const slug = typeof site?.slug === 'string' && site.slug.trim() ? site.slug.trim() : 'site'
  const name =
    typeof site?.name === 'string' && site.name.trim()
      ? site.name.trim()
      : typeof site?.slug === 'string'
        ? site.slug.trim()
        : 'Site'
  const mp = typeof site?.mainProduct === 'string' ? site.mainProduct : null
  const nicheHint = nicheDataToHeroHint(site?.nicheData ?? null)
  return buildHeroBannerTogetherVarsFromPromptParts({
    siteName: name,
    slugOrKey: slug,
    mainProduct: mp,
    nicheHint,
  })
}

export const TOGETHER_CATEGORY_COVER_PROMPT_TEMPLATE =
  'Ultra-clean ecommerce category tile, square composition, centered single hero object or minimal flat-lay. Subject: "{{category_name}}". {{slug_suffix}}{{desc_chunk}}{{site_chunk}} Style: realistic product photography lighting, subtle shadow, muted premium background gradient, high-end editorial feel. No text overlays, watermarks, or logos.'

export function buildCategoryCoverTogetherVars(parts: {
  categoryName: string
  slug: string
  description: string | null
  siteName?: string | null
}): Record<string, string> {
  const name = parts.categoryName.trim() || parts.slug.trim() || 'Product category'
  const slugT = parts.slug.trim()
  const slug_suffix = slugT ? `slug: ${slugT}` : ''
  const desc = (parts.description ?? '').trim().slice(0, 500)
  const desc_chunk = desc ? ` Category hint: ${desc}` : ''
  const site = parts.siteName?.trim()
  const site_chunk = site ? ` Store context: ${site}.` : ''
  return {
    category_name: name,
    slug_suffix,
    desc_chunk,
    site_chunk,
  }
}

export function buildCategoryCoverTogetherPromptText(parts: {
  categoryName: string
  slug: string
  description: string | null
  siteName?: string | null
}): string {
  return substitutePromptPlaceholders(
    TOGETHER_CATEGORY_COVER_PROMPT_TEMPLATE,
    buildCategoryCoverTogetherVars(parts),
  )
}

export const TOGETHER_ARTICLE_FEATURED_IMAGE_PROMPT_TEMPLATE =
  'Editorial blog hero image, no readable text overlays, cinematic lighting. Topic: "{{title}}". {{tail}}'

export function buildArticleFeaturedTogetherVars(args: {
  title: string
  excerpt?: string | null
  keywordTerm?: string | null
}): Record<string, string> {
  const tail = [args.excerpt ?? '', args.keywordTerm ?? ''].join(' ').trim()
  return {
    title: args.title.trim(),
    tail,
  }
}

export function buildArticleFeaturedTogetherPromptText(args: {
  title: string
  excerpt?: string | null
  keywordTerm?: string | null
}): string {
  const vars = buildArticleFeaturedTogetherVars(args)
  return substitutePromptPlaceholders(TOGETHER_ARTICLE_FEATURED_IMAGE_PROMPT_TEMPLATE, vars).trim().slice(0, 2000)
}
