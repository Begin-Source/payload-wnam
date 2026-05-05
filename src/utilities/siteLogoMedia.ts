import type { Media, Site, SiteBlueprint } from '@/payload-types'
import type { AmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import { defaultAmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import { mergeAmzSiteConfigFromRaw } from '@/site-layouts/amz-template-1/mergeAmzSiteConfig'
import { substitutePromptPlaceholders } from '@/utilities/domainGeneration/substitutePromptPlaceholders'
import {
  TOGETHER_SITE_LOGO_PROMPT_TEMPLATE,
  buildSiteLogoTogetherVarsFromPromptParts,
} from '@/utilities/togetherTenantPrompts/togetherImagePromptTemplates'

const DEFAULT_LOGO_PX = 1024

const DEFAULT_AMZ_BRAND_NAME = defaultAmzSiteConfig.brand.name.trim()

/**
 * When Blueprint JSON leaves the stock placeholder (or omits brand.name), show `sites.name` in the shell.
 */
export function applySiteNameFallbackToAmzBrand(
  cfg: AmzSiteConfig | undefined,
  site: Pick<Site, 'name'> | null | undefined,
): AmzSiteConfig | undefined {
  if (!cfg || !site?.name?.trim()) return cfg
  const incoming = site.name.trim()
  const current = cfg.brand?.name?.trim() ?? ''
  if (current && current !== DEFAULT_AMZ_BRAND_NAME) return cfg
  return {
    ...cfg,
    brand: {
      ...cfg.brand,
      name: incoming,
    },
  }
}

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
  return substitutePromptPlaceholders(
    TOGETHER_SITE_LOGO_PROMPT_TEMPLATE,
    buildSiteLogoTogetherVarsFromPromptParts({
      siteName: parts.siteName,
      slugOrKey: parts.slugOrKey,
      mainProduct: parts.mainProduct,
      brandNameFromDesign: parts.brandNameFromDesign,
    }),
  )
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
