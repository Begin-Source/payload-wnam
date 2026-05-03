import { cache } from 'react'

import { getPayload } from 'payload'

import config from '@/payload.config'
import type { PublicLanding, Site, SiteBlueprint } from '@/payload-types'
import { getRequestHost } from '@/utilities/normalizeRequestHost'
import { resolveSiteForLanding } from '@/utilities/resolveSiteForLanding'
import type { AmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import { mergeAmzSiteConfigFromRaw } from '@/site-layouts/amz-template-1/mergeAmzSiteConfig'
import { coerceBrandLogoLucideForNiche } from '@/utilities/amzNicheLucideIcon'
import { applyHeroBannerToAmzSiteConfig, publicUrlFromSiteHeroBanner } from '@/utilities/heroBannerMedia'
import {
  applySiteLogoToAmzSiteConfig,
  applySiteNameFallbackToAmzBrand,
  publicUrlFromSiteLogo,
} from '@/utilities/siteLogoMedia'
import type { AppLocale } from '@/i18n/config'
import { mergeTemplate1Layers, type Template1Theme } from '@/utilities/publicLandingTemplate1'
import { normalizeSitePublicLocales } from '@/utilities/sitePublicLocales'

export type LandingFontPreset = 'system' | 'serif' | 'noto_sans_sc'

export type LandingTheme = {
  browserTitle: string
  siteName: string
  tagline: string
  loggedInTitle: string
  loggedInSubtitle: string
  footerLine: string
  ctaLabel: string
  bgColor: string
  textColor: string
  mutedColor: string
  ctaBgColor: string
  ctaTextColor: string
  fontPreset: LandingFontPreset
}

export type BlogChromeTheme = {
  blogPrimaryColor: string
  blogAccentColor: string
  blogContentBgColor: string
  blogCardBgColor: string
  blogHeaderTextColor: string
  blogHeadingColor: string
  blogBodyColor: string
  aboutTitle: string
  aboutBio: string
  aboutImageId: number | null
  aboutCtaLabel: string
  aboutCtaHref: string
}

/** Whole-site shell variant from `sites.siteLayout` (empty string → `default`). */
export type SiteLayoutId =
  | 'default'
  | 'wide'
  | 'affiliate_reviews'
  | 'template1'
  | 'template2'
  | 'amz-template-1'
  | 'amz-template-2'

const SITE_LAYOUT_IDS = new Set<SiteLayoutId>([
  'default',
  'wide',
  'affiliate_reviews',
  'template1',
  'template2',
  'amz-template-1',
  'amz-template-2',
])

/** Template1/2 共用 `Template1*` 壳与 `theme.template1` 文案 merge（Template2 用 `t2LocaleJson`）。 */
export function isTemplateShellLayout(
  layout: string | null | undefined,
): layout is 'template1' | 'template2' {
  return layout === 'template1' || layout === 'template2'
}

/** True for `amz-template-1` or `amz-template-2` (shared `amzSiteConfigJson` + AMZ-style chrome). */
export function isAmzSiteLayout(
  layout: string | null | undefined,
): layout is 'amz-template-1' | 'amz-template-2' {
  return layout === 'amz-template-1' || layout === 'amz-template-2'
}

export function isAmzTemplate2Layout(
  layout: string | null | undefined,
): layout is 'amz-template-2' {
  return layout === 'amz-template-2'
}

function normalizeSiteLayout(value: string | null | undefined): SiteLayoutId {
  if (value && SITE_LAYOUT_IDS.has(value as SiteLayoutId)) return value as SiteLayoutId
  return 'default'
}

export type FooterResourceLink = { label: string; href: string }

const DEFAULT_AFFILIATE_DISCLOSURE =
  'We may earn a small commission from purchases made through links on this site. This helps us provide unbiased reviews at no extra cost to you.'

function parseFooterResourceLinks(raw: unknown): FooterResourceLink[] {
  let value: unknown = raw
  if (typeof value === 'string' && value.trim()) {
    try {
      value = JSON.parse(value) as unknown
    } catch {
      return []
    }
  }
  if (!value || !Array.isArray(value)) return []
  const out: FooterResourceLink[] = []
  for (const row of value) {
    if (!row || typeof row !== 'object') continue
    const r = row as { label?: unknown; href?: unknown }
    const label = String(r.label ?? '').trim()
    const href = String(r.href ?? '').trim()
    if (label && href) out.push({ label, href })
  }
  return out
}

/**
 * Public blog shell + landing text/colors. `siteLayout` comes from `sites.siteLayout`.
 */
export type PublicSiteTheme = LandingTheme &
  BlogChromeTheme & {
    siteLayout: SiteLayoutId
    reviewHubTaglineResolved: string
    affiliateDisclosureResolved: string
    footerResourceLinks: FooterResourceLink[]
    /** T1/T2 壳层文案（`template1`→ 设计 t1LocaleJson；`template2`→ t2LocaleJson）；结构同 Template1Theme。 */
    template1: Template1Theme
    /** `amz-template-1` / `amz-template-2`：设计 amzSiteConfigJson 与默认 deep merge 后的站点壳配置。 */
    amzSiteConfig?: AmzSiteConfig
    /** Public URL for `sites.siteLogo` — header (AMZ) + `generateMetadata` icons when set。 */
    siteLogoUrl?: string
    /** Per-site enabled locales (ordered) + default for redirects / menus. */
    publicLocales: AppLocale[]
    defaultPublicLocale: AppLocale
  }

const BLOG_DEFAULTS: BlogChromeTheme = {
  blogPrimaryColor: '#2d8659',
  blogAccentColor: '#e6c84a',
  blogContentBgColor: '#f0f0f0',
  blogCardBgColor: '#ffffff',
  blogHeaderTextColor: '#ffffff',
  blogHeadingColor: '#333333',
  blogBodyColor: '#444444',
  aboutTitle: 'About Me',
  aboutBio: '',
  aboutImageId: null,
  aboutCtaLabel: 'Learn more',
  aboutCtaHref: '#',
}

function firstNonEmpty(...values: (string | null | undefined)[]): string | undefined {
  for (const v of values) {
    if (v == null) continue
    const t = String(v).trim()
    if (t) return t
  }
  return undefined
}

export function relationId(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number' && !Number.isNaN(value)) return value
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id: unknown }).id
    if (typeof id === 'number' && !Number.isNaN(id)) return id
  }
  return null
}

function pickFontPreset(global: PublicLanding, design: SiteBlueprint | null): LandingFontPreset {
  const order = [design?.designFontPreset, global.fontPreset] as const
  for (const v of order) {
    if (v === 'system' || v === 'serif' || v === 'noto_sans_sc') return v
  }
  return 'system'
}

/**
 * Merge: **设计 design*** → **全局 public-landing**；仅 `site.name` 仍来自 `sites`（用于题头兜底）。
 */
export function mergeLandingLayers(
  global: PublicLanding,
  design: SiteBlueprint | null,
  site: Site | null,
): LandingTheme {
  const g = global
  const d = design
  const s = site

  const siteName = firstNonEmpty(d?.designSiteName, s?.name, g.siteName) ?? '基源科技'
  const browserTitle =
    firstNonEmpty(d?.designBrowserTitle, g.browserTitle, s?.name, siteName) ?? siteName
  const tagline = firstNonEmpty(d?.designTagline, g.tagline) ?? ''
  const loggedInTitle = firstNonEmpty(d?.designLoggedInTitle, g.loggedInTitle) ?? ''
  const loggedInSubtitle = firstNonEmpty(d?.designLoggedInSubtitle, g.loggedInSubtitle) ?? ''
  const footerLine = firstNonEmpty(d?.designFooterLine, g.footerLine) ?? ''
  const ctaLabel = firstNonEmpty(d?.designCtaLabel, g.adminCtaLabel) ?? ''
  const bgColor = firstNonEmpty(d?.designBgColor, g.backgroundColor) ?? '#000000'
  const textColor = firstNonEmpty(d?.designTextColor, g.textColor) ?? '#ffffff'
  const mutedColor =
    firstNonEmpty(d?.designMutedColor, g.mutedTextColor) ?? 'rgba(255, 255, 255, 0.55)'
  const ctaBgColor = firstNonEmpty(d?.designCtaBgColor, g.ctaBackgroundColor) ?? '#ffffff'
  const ctaTextColor = firstNonEmpty(d?.designCtaTextColor, g.ctaTextColor) ?? '#000000'
  const fontPreset = pickFontPreset(g, d)

  return {
    browserTitle,
    siteName,
    tagline,
    loggedInTitle,
    loggedInSubtitle,
    footerLine,
    ctaLabel,
    bgColor,
    textColor,
    mutedColor,
    ctaBgColor,
    ctaTextColor,
    fontPreset,
  }
}

/**
 * 设计 design* → 全局 public-landing（博客壳与 About）。文案与色值不再来自 `sites` 列。
 */
export function mergeBlogChromeLayers(
  global: PublicLanding,
  design: SiteBlueprint | null,
): BlogChromeTheme {
  const g = global
  const d = design

  const aboutImageId = relationId(d?.designAboutImage) ?? relationId(g.aboutImage)

  return {
    blogPrimaryColor:
      firstNonEmpty(
        d?.designBlogPrimaryColor,
        g.blogPrimaryColor,
        BLOG_DEFAULTS.blogPrimaryColor,
      ) ?? BLOG_DEFAULTS.blogPrimaryColor,
    blogAccentColor:
      firstNonEmpty(
        d?.designBlogAccentColor,
        g.blogAccentColor,
        BLOG_DEFAULTS.blogAccentColor,
      ) ?? BLOG_DEFAULTS.blogAccentColor,
    blogContentBgColor:
      firstNonEmpty(
        d?.designBlogContentBgColor,
        g.blogContentBgColor,
        BLOG_DEFAULTS.blogContentBgColor,
      ) ?? BLOG_DEFAULTS.blogContentBgColor,
    blogCardBgColor:
      firstNonEmpty(
        d?.designBlogCardBgColor,
        g.blogCardBgColor,
        BLOG_DEFAULTS.blogCardBgColor,
      ) ?? BLOG_DEFAULTS.blogCardBgColor,
    blogHeaderTextColor:
      firstNonEmpty(
        d?.designBlogHeaderTextColor,
        g.blogHeaderTextColor,
        BLOG_DEFAULTS.blogHeaderTextColor,
      ) ?? BLOG_DEFAULTS.blogHeaderTextColor,
    blogHeadingColor:
      firstNonEmpty(
        d?.designBlogHeadingColor,
        g.blogHeadingColor,
        BLOG_DEFAULTS.blogHeadingColor,
      ) ?? BLOG_DEFAULTS.blogHeadingColor,
    blogBodyColor:
      firstNonEmpty(
        d?.designBlogBodyColor,
        g.blogBodyColor,
        BLOG_DEFAULTS.blogBodyColor,
      ) ?? BLOG_DEFAULTS.blogBodyColor,
    aboutTitle:
      firstNonEmpty(
        d?.designAboutTitle,
        g.aboutTitle,
        BLOG_DEFAULTS.aboutTitle,
      ) ?? BLOG_DEFAULTS.aboutTitle,
    aboutBio: firstNonEmpty(d?.designAboutBio, g.aboutBio) ?? '',
    aboutImageId,
    aboutCtaLabel:
      firstNonEmpty(
        d?.designAboutCtaLabel,
        g.aboutCtaLabel,
        BLOG_DEFAULTS.aboutCtaLabel,
      ) ?? BLOG_DEFAULTS.aboutCtaLabel,
    aboutCtaHref:
      firstNonEmpty(
        d?.designAboutCtaHref,
        g.aboutCtaHref,
        BLOG_DEFAULTS.aboutCtaHref,
      ) ?? BLOG_DEFAULTS.aboutCtaHref,
  }
}

function footerResourceLinksFromDesign(design: SiteBlueprint | null): FooterResourceLink[] {
  return parseFooterResourceLinks(design?.designFooterResourceLinks)
}

export function mergePublicSiteTheme(
  global: PublicLanding,
  design: SiteBlueprint | null,
  site: Site | null,
): PublicSiteTheme {
  const landing = mergeLandingLayers(global, design, site)
  const blogChrome = mergeBlogChromeLayers(global, design)
  const sl = normalizeSiteLayout(firstNonEmpty(site?.siteLayout))
  const amzSl = sl === 'amz-template-1' || sl === 'amz-template-2'
  const template1Theme = amzSl
    ? mergeTemplate1Layers(null, null)
    : sl === 'template2'
      ? mergeTemplate1Layers(design?.t2LocaleJson, null)
      : mergeTemplate1Layers(design?.t1LocaleJson, null)
  let amzSiteConfig = amzSl ? mergeAmzSiteConfigFromRaw(design?.amzSiteConfigJson) : undefined
  const siteLogoUrl = publicUrlFromSiteLogo(site)
  if (amzSl && amzSiteConfig != null && site != null) {
    const bannerUrl = publicUrlFromSiteHeroBanner(site)
    amzSiteConfig = applyHeroBannerToAmzSiteConfig(amzSiteConfig, bannerUrl)
    amzSiteConfig = applySiteLogoToAmzSiteConfig(amzSiteConfig, siteLogoUrl)
    amzSiteConfig = applySiteNameFallbackToAmzBrand(amzSiteConfig, site)
    coerceBrandLogoLucideForNiche(
      amzSiteConfig,
      typeof site.mainProduct === 'string' ? site.mainProduct : null,
      site.nicheData ?? null,
      site.primaryDomain ?? null,
      typeof site.slug === 'string' ? site.slug : null,
    )
  }
  const landingForTheme =
    amzSl && amzSiteConfig
      ? {
          ...landing,
          browserTitle:
            firstNonEmpty(amzSiteConfig.seo?.title, landing.browserTitle) ?? landing.browserTitle,
          tagline:
            firstNonEmpty(amzSiteConfig.seo?.description, landing.tagline) ?? landing.tagline,
        }
      : landing
  const { publicLocales, defaultPublicLocale } = normalizeSitePublicLocales(site)
  return {
    ...landingForTheme,
    ...blogChrome,
    siteLayout: sl,
    publicLocales,
    defaultPublicLocale,
    reviewHubTaglineResolved:
      firstNonEmpty(design?.designReviewHubTagline, landingForTheme.tagline) ?? '',
    affiliateDisclosureResolved:
      firstNonEmpty(design?.designAffiliateDisclosureLine) ?? DEFAULT_AFFILIATE_DISCLOSURE,
    footerResourceLinks: footerResourceLinksFromDesign(design),
    template1: template1Theme,
    amzSiteConfig,
    ...(siteLogoUrl ? { siteLogoUrl } : {}),
  }
}

type PublicSiteBundle = {
  site: Site | null
  globalDoc: PublicLanding
  blueprint: SiteBlueprint | null
}

const loadPublicSiteBundle = cache(
  async (rawHostKey: string, siteSlugKey: string): Promise<PublicSiteBundle> => {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })
    const globalDoc = (await payload.findGlobal({
      slug: 'public-landing',
      depth: 0,
    })) as PublicLanding

    const site = await resolveSiteForLanding(payload, {
      rawHost: rawHostKey,
      siteSlugFromHeader: siteSlugKey,
    })

    let blueprint: SiteBlueprint | null = null
    if (site?.id != null) {
      const found = await payload.find({
        collection: 'site-blueprints',
        where: { site: { equals: site.id } },
        limit: 1,
        sort: '-updatedAt',
        depth: 0,
        overrideAccess: true,
      })
      blueprint = (found.docs[0] as SiteBlueprint | undefined) ?? null
    }

    return { site, globalDoc, blueprint }
  },
)

const loadPublicSiteTheme = cache(
  async (rawHostKey: string, siteSlugKey: string): Promise<PublicSiteTheme> => {
    const { site, globalDoc, blueprint } = await loadPublicSiteBundle(rawHostKey, siteSlugKey)
    return mergePublicSiteTheme(globalDoc, blueprint, site)
  },
)

/**
 * Cached per request: theme + resolved site + raw layers (for callers that need `site.id` without extra resolve).
 */
export async function getPublicSiteContext(headers: Headers): Promise<{
  site: Site | null
  theme: PublicSiteTheme
}> {
  const rawHost = getRequestHost(headers) ?? ''
  const siteSlug = headers.get('x-site-slug')?.trim() ?? ''
  const bundle = await loadPublicSiteBundle(rawHost, siteSlug)
  const theme = mergePublicSiteTheme(bundle.globalDoc, bundle.blueprint, bundle.site)
  return { site: bundle.site, theme }
}

/**
 * Full public theme (landing + blog chrome) for metadata and layout.
 */
export async function getPublicSiteTheme(headers: Headers): Promise<PublicSiteTheme> {
  const rawHost = getRequestHost(headers) ?? ''
  const siteSlug = headers.get('x-site-slug')?.trim() ?? ''
  return loadPublicSiteTheme(rawHost, siteSlug)
}

/** @deprecated Use `getPublicSiteTheme`; kept for gradual migration. */
export async function getLandingThemeForRequest(headers: Headers): Promise<PublicSiteTheme> {
  return getPublicSiteTheme(headers)
}
