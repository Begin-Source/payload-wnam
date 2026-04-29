/**
 * `payload.find` / `findByID` on `sites` for public landing: narrow SELECT so D1 does not
 * hit max result width. Excludes e.g. `operators` (hasMany users) which adds `sites_rels` aggregation.
 *
 * Template1 copy is configured on **`site-blueprints`** (`t1LocaleJson`); do not add wide `t1_*` columns to `sites`.
 *
 * Kept in sync with merge sources in:
 * - `mergeLandingLayers` / `mergeBlogChromeLayers` in `publicLandingTheme.ts`
 * - `mergeTemplate1FromSite` / `siteT1FromLocaleJson` in `publicLandingTemplate1.ts`
 */
export const publicSiteThemeSelectWithoutT1 = {
  id: true,
  name: true,
  slug: true,
  primaryDomain: true,
  status: true,
  siteLayout: true,
  blueprint: true,
} as const
