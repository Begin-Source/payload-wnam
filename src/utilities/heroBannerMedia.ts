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

/** Together prompt for homepage hero backdrop (override wins). */
export function makeHeroBannerImagePrompt(parts: {
  siteName: string
  slugOrKey: string
  mainProduct?: string | null
  nicheHint?: string | null
  heroTitle?: string | null
  heroSubtitle?: string | null
  override?: string | null
}): string {
  const o = parts.override?.trim()
  if (o) return o
  const site = parts.siteName.trim() || 'Store'
  const slug = parts.slugOrKey.trim()
  const mp = parts.mainProduct?.trim()
  const niche = parts.nicheHint?.trim()?.slice(0, 350)
  const ht = parts.heroTitle?.trim()
  const hs = parts.heroSubtitle?.trim()

  return [
    'Wide cinematic website hero backdrop, panoramic 16:9 landscape composition, atmospheric depth, soft bokeh.',
    `Brand/site: "${site}". ${slug ? `Slug: ${slug}.` : ''}`,
    ht ? `Headline cue: "${ht.slice(0, 120)}".` : '',
    hs ? `Subhead cue: "${hs.slice(0, 160)}".` : '',
    mp ? `Primary product/context: ${mp.slice(0, 200)}.` : '',
    niche ? `Niche JSON hint: ${niche}` : '',
    'Style: premium editorial, unobtrusive illustration or abstract product-adjacent scene, cohesive cool/warm hues suitable behind large white headings.',
    'Leave ample negative center space so UI text overlays stay readable.',
    'No logos, watermark, legible typography, distorted hands, cluttered UI mocks.',
  ]
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .join(' ')
}

export function composeHeroBannerPromptFromSiteBlueprint(
  site: Pick<Site, 'name' | 'slug' | 'mainProduct' | 'nicheData'> | null,
  blueprint: SiteBlueprint | null | undefined,
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
  const { heroTitle, heroSubtitle } = heroCopyFromBlueprint(blueprint)
  return makeHeroBannerImagePrompt({
    siteName: name,
    slugOrKey: slug,
    mainProduct: mp,
    nicheHint: nicheSnippet(site?.nicheData ?? null),
    heroTitle,
    heroSubtitle,
    override: override ?? null,
  })
}
