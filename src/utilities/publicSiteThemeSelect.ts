/**
 * `payload.find` / `findByID` on `sites` for public landing: narrow SELECT so D1 does not
 * hit max result width. Excludes e.g. `operators` (hasMany users) which adds `sites_rels` aggregation.
 *
 * Template1 copy is configured on **`site-blueprints`** (`t1LocaleJson`); do not add wide `t1_*` columns to `sites`.
 *
 * Kept in sync with merge sources in:
 * - `mergeLandingLayers` / `mergeBlogChromeLayers` in `publicLandingTheme.ts`
 * - `mergeTemplate1FromSite` / `siteT1FromLocaleJson` in `publicLandingTemplate1.ts`
 * - `publicUrlFromSiteHeroBanner` in `heroBannerMedia.ts`; `siteLogo` for header/favicon (`siteLogoMedia.ts`).
 * - `mainProduct`, `nicheData` — AMZ Lucide fallback + niche hints (`mergePublicSiteTheme`).
 */
export const publicSiteHeroBannerMediaSelect = {
  url: true,
  alt: true,
  thumbnailURL: true,
  width: true,
  height: true,
  mimeType: true,
  filesize: true,
  filename: true,
} as const

export const publicSiteThemeSelectWithoutT1 = {
  id: true,
  name: true,
  slug: true,
  primaryDomain: true,
  status: true,
  siteLayout: true,
  blueprint: true,
  homepageHeroBanner: publicSiteHeroBannerMediaSelect,
  siteLogo: publicSiteHeroBannerMediaSelect,
  mainProduct: true,
  nicheData: true,
} as const
