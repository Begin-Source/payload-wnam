import type { Media, Site, SiteBlueprint } from '@/payload-types'
import type { AmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import { mergeAmzSiteConfigFromRaw } from '@/site-layouts/amz-template-1/mergeAmzSiteConfig'

const DEFAULT_LOGO_PX = 1024

/** Public CDN URL from site.siteLogo after depth-1 populate. */
export function publicUrlFromSiteLogo(
  site: Pick<Site, 'siteLogo'> | null | undefined,
): string | undefined {
  const m = site?.siteLogo
  if (m != null && typeof m === 'object' && 'url' in m) {
    const u = (m as Media).url
    if (typeof u === 'string' && u.trim()) return u.trim()
  }
  return undefined
}

/** When `url` is set, force AMZ header to use `brand.logo` as image (same URL as favicon). */
export function applySiteLogoToAmzSiteConfig(
  cfg: AmzSiteConfig | undefined,
  url: string | undefined,
): AmzSiteConfig | undefined {
  if (!cfg || !url?.trim()) return cfg
  const u = url.trim()
  return {
    ...cfg,
    brand: {
      ...cfg.brand,
      logo: {
        ...cfg.brand.logo,
        type: 'image',
        imagePath: u,
        icon: '',
        svgPath: '',
      },
    },
  }
}

/** Square logo size for Together (`TOGETHER_SITE_LOGO_SIZE`, default 1024). */
export function siteLogoImageDimensions(): { width: number; height: number } {
  const n = Number(process.env.TOGETHER_SITE_LOGO_SIZE?.trim())
  const side =
    Number.isFinite(n) && n >= 256 && n <= 2048 ? Math.floor(n) : DEFAULT_LOGO_PX
  return { width: side, height: side }
}

function brandNameFromBlueprint(blueprint: SiteBlueprint | null | undefined): string | null {
  if (!blueprint?.amzSiteConfigJson || typeof blueprint.amzSiteConfigJson !== 'object') {
    return null
  }
  const cfg = mergeAmzSiteConfigFromRaw(blueprint.amzSiteConfigJson)
  const n = cfg.brand?.name?.trim()
  return n ? n.slice(0, 120) : null
}

export function makeSiteLogoImagePrompt(parts: {
  siteName: string
  slugOrKey: string
  mainProduct?: string | null
  brandNameFromDesign?: string | null
  override?: string | null
}): string {
  const o = parts.override?.trim()
  if (o) return o
  const site = parts.siteName.trim() || 'Store'
  const slug = parts.slugOrKey.trim()
  const mp = parts.mainProduct?.trim()
  const brand = parts.brandNameFromDesign?.trim()

  return [
    'Single isolated brand mark only: ultra-simple flat vector or geometric glyph, symmetric or centered logo — not a poster, screenshot, collage, framed picture, banner, scenery, lifestyle photo, mockup device, gradient “photo backdrop”, vignette border, polaroid, or postcard layout.',
    'Plain flat background: pure white #FFFFFF strongly preferred OR one solid light neutral (#F5F5F5–#EEEEEE); no busy textures, sunset/sky/office scenes, wood floors, blurred bokeh.',
    `The mark occupies ~55–72% of the square canvas height with generous even padding (breathing room); centered; looks sharp when scaled down to 16×16 px favicon.`,
    `Site: "${site}". ${slug ? `Key: ${slug}.` : ''}`,
    brand ? `Brand cue from design: "${brand.slice(0, 80)}".` : '',
    mp ? `Subject hint only (abstract shape / symbol), not a literal photograph: ${mp.slice(0, 120)}.` : '',
    'At most 3 flat colors excluding background; crisp edges; thick readable strokes; absolutely no gradients that mimic lighting/photorealism.',
    'No human faces/hands/full products; no glossy 3D render; no fine hairlines; no watermark; no slogan lines; no tiny illegible typography.',
    'PNG-style clarity; think app icon sheet / identity mark suitable for Shopify header favicon bundle.',
  ]
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .join(' ')
}

export function composeSiteLogoPromptFromSiteBlueprint(
  site: Pick<Site, 'name' | 'slug' | 'mainProduct'> | null,
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
  return makeSiteLogoImagePrompt({
    siteName: name,
    slugOrKey: slug,
    mainProduct: mp,
    brandNameFromDesign: brandNameFromBlueprint(blueprint),
    override: override ?? null,
  })
}
