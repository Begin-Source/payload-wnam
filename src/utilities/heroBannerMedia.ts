import type { Media, Site, SiteBlueprint } from '@/payload-types'
import type { AmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import { mergeAmzSiteConfigFromRaw } from '@/site-layouts/amz-template-1/mergeAmzSiteConfig'

export const DEFAULT_HERO_BANNER_WIDTH = 1536
export const DEFAULT_HERO_BANNER_HEIGHT = 640

/** Public CDN URL from site.homepageHeroBanner after depth-1 populate (select includes `url`). */
export function publicUrlFromSiteHeroBanner(
  site: Pick<Site, 'homepageHeroBanner'> | null | undefined,
): string | undefined {
  const m = site?.homepageHeroBanner
  if (m != null && typeof m === 'object' && 'url' in m) {
    const u = (m as Media).url
    if (typeof u === 'string' && u.trim()) return u.trim()
  }
  return undefined
}

/** Merge runtime hero banner URL into cloned AMZ config (safe for SSR). */
export function applyHeroBannerToAmzSiteConfig(
  cfg: AmzSiteConfig | undefined,
  url: string | undefined,
): AmzSiteConfig | undefined {
  if (!cfg) return cfg
  const heroPrev = cfg.homepage.hero as Record<string, unknown>
  const heroNext = { ...heroPrev }
  if (typeof url === 'string' && url.trim()) {
    heroNext.bannerImage = url.trim()
  } else {
    delete heroNext.bannerImage
  }
  return {
    ...cfg,
    homepage: {
      ...cfg.homepage,
      hero: heroNext as AmzSiteConfig['homepage']['hero'],
    },
  }
}

/** Optional env override for Together hero dimensions (`TOGETHER_HERO_IMAGE_WIDTH` / `_HEIGHT`). */
export function heroBannerImageDimensions(): { width: number; height: number } {
  const w = Number(process.env.TOGETHER_HERO_IMAGE_WIDTH?.trim())
  const h = Number(process.env.TOGETHER_HERO_IMAGE_HEIGHT?.trim())
  const width =
    Number.isFinite(w) && w > 16 && w < 4096 ? Math.floor(w) : DEFAULT_HERO_BANNER_WIDTH
  const height =
    Number.isFinite(h) && h > 16 && h < 4096 ? Math.floor(h) : DEFAULT_HERO_BANNER_HEIGHT
  return { width, height }
}

function nicheSnippet(raw: Site['nicheData']): string | null {
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

export type HeroBannerPromptContext = Pick<Site, 'name' | 'mainProduct' | 'nicheData'> & {
  heroTitle?: string | null
  heroSubtitle?: string | null
}

export function heroCopyFromBlueprint(blueprint: SiteBlueprint | null | undefined): {
  heroTitle: string | null
  heroSubtitle: string | null
} {
  if (!blueprint?.amzSiteConfigJson || typeof blueprint.amzSiteConfigJson !== 'object') {
    return { heroTitle: null, heroSubtitle: null }
  }
  const cfg = mergeAmzSiteConfigFromRaw(blueprint.amzSiteConfigJson)
  const hero = cfg.homepage?.hero as { title?: string; subtitle?: string } | undefined
  const t = hero?.title?.trim() || ''
  const st = hero?.subtitle?.trim() || ''
  return {
    heroTitle: t ? t.slice(0, 300) : null,
    heroSubtitle: st ? st.slice(0, 400) : null,
  }
}

/** Together `negative_prompt`: suppress text and full-page UI composites in hero backdrops. */
export function heroBannerImageNegativePrompt(): string {
  return [
    'text',
    'typography',
    'letters',
    'words',
    'subtitles',
    'captions',
    'alphanumeric overlays',
    'logos',
    'wordmarks',
    'watermarks',
    'navigation bar',
    'menu bar',
    'header chrome',
    'browser chrome',
    'browser window',
    'website screenshot',
    'webpage layout',
    'landing page mockup',
    'UI mockup',
    'user interface',
    'smartphone app interface',
    'laptop screen with interface',
    'domain name in image',
    'URL string',
    'billboard text',
    'poster typography',
    'book cover text',
    'magazine masthead',
    'packaging readable labels',
    'QR code',
    'infographic with labels',
    'composite multi-panel layout',
    'split screen design',
  ].join(', ')
}

/** Together prompt for homepage hero backdrop (override wins). */
export function makeHeroBannerImagePrompt(parts: {
  siteName: string
  slugOrKey: string
  mainProduct?: string | null
  nicheHint?: string | null
  override?: string | null
}): string {
  const o = parts.override?.trim()
  if (o) return o
  const site = parts.siteName.trim() || 'Store'
  const slug = parts.slugOrKey.trim()
  const mp = parts.mainProduct?.trim()
  const niche = parts.nicheHint?.trim()?.slice(0, 350)

  return [
    'Wide cinematic landscape photograph or editorial illustration, panoramic wide aspect similar to 16:9, atmospheric depth, soft bokeh, natural full-bleed scene only; not a screenshot, not a webpage, not a composite layout, no user interface of any kind.',
    `Subject context for vibe only—do not render any part of the following as visible letters or logos in the image. Brand or site identity (mood only): ${site}. ${slug ? `Key: ${slug}.` : ''}`,
    mp ? `Primary product/context: ${mp.slice(0, 200)}.` : '',
    niche ? `Niche hint (non-literal, no labels to paint): ${niche}` : '',
    'Style: premium editorial photography or tasteful illustration; unobtrusive, cohesive cool or warm palette suitable behind a separate HTML text overlay (the overlay is not part of this render).',
    'Calm central readability via soft gradients and atmospheric haze only—absolutely no typography inside pixels.',
    'No logos, captions, storefront signage, device screens with readable UI, hashtags, watermarks, instructional diagrams with text.',
    'Single continuous scene; avoid collage, storyboard, browser frames, or mock-ups.',
  ]
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .join(' ')
}

export function composeHeroBannerPromptFromSiteBlueprint(
  site: Pick<Site, 'name' | 'slug' | 'mainProduct' | 'nicheData'> | null,
  _blueprint: SiteBlueprint | null | undefined,
  override?: string | null,
): string {
  const slug = typeof site?.slug === 'string' && site.slug.trim() ? site.slug.trim() : 'site'
  const name =
    typeof site?.name === 'string' && site.name.trim()
      ? site.name.trim()
      : typeof site?.slug === 'string'
        ? site.slug.trim()
        : 'Site'
  const mp = typeof site?.mainProduct === 'string' ? site.mainProduct : null
  return makeHeroBannerImagePrompt({
    siteName: name,
    slugOrKey: slug,
    mainProduct: mp,
    nicheHint: nicheSnippet(site?.nicheData ?? null),
    override: override ?? null,
  })
}
