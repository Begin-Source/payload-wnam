import type { AmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'

import { isPlainObject } from '@/site-layouts/amz-template-1/mergeAmzSiteConfig'

/**
 * Leaf dot-paths the fill-slots workflow may overwrite.
 * Strings: English copy or `oklch(...)` theme tokens or font family names (fonts.*).
 */
export const AMZ_DESIGN_FILLABLE_DOT_PATHS: readonly string[] = [
  ...[
    'theme.colors.light.primary',
    'theme.colors.light.secondary',
    'theme.colors.light.accent',
    'theme.colors.light.background',
    'theme.colors.light.foreground',
    'theme.colors.light.card',
    'theme.colors.light.border',
    'theme.colors.light.input',
    'theme.colors.light.muted',
    'theme.colors.light.mutedForeground',
    'theme.colors.dark.primary',
    'theme.colors.dark.background',
    'theme.colors.dark.foreground',
    'theme.colors.dark.card',
    'theme.colors.dark.border',
    'theme.colors.dark.input',
    'theme.colors.dark.muted',
    'theme.colors.dark.mutedForeground',
    'fonts.sans',
    'fonts.mono',
  ],
  'brand.tagline',
  'brand.description',
  'seo.title',
  'seo.titleTemplate',
  'seo.description',
  'seo.author',
  'seo.social.twitter',
  'homepage.hero.title',
  'homepage.hero.subtitle',
  'homepage.hero.searchPlaceholder',
  'homepage.categories.title',
  'homepage.categories.subtitle',
  'homepage.featuredProducts.title',
  'homepage.featuredProducts.subtitle',
  'homepage.latestReviews.title',
  'homepage.latestReviews.subtitle',
  'homepage.cta.title',
  'homepage.cta.subtitle',
  'homepage.cta.emailPlaceholder',
  'homepage.cta.buttonText',
  'pages.products.title',
  'pages.products.description',
  'pages.products.indexNote',
  'pages.products.categoryH1Lead',
  'pages.products.categoryH1Suffix',
  'pages.products.categoryProductCountTemplate',
  'pages.products.categoryProductCountEmpty',
  'pages.products.categoryBrowseOtherTitle',
  'pages.products.categoryBrowseOtherDescription',
  'pages.reviews.title',
  'pages.reviews.description',
  'pages.guides.title',
  'pages.guides.description',
  'pages.guides.cta.title',
  'pages.guides.cta.description',
  'pages.guides.cta.primaryButton.text',
  'footer.about.title',
  'footer.about.description',
  'footer.reviewCategoryNavLabelTemplate',
  'footer.copyright',
  'footer.affiliateNotice',
]

const FILL_PATH_SET = new Set(AMZ_DESIGN_FILLABLE_DOT_PATHS)

/** Example flat JSON keys for prompts (placeholder values). */
export function buildFlatFillSkeletonPlaceholderJson(): Record<string, string> {
  const o: Record<string, string> = {}
  for (const p of AMZ_DESIGN_FILLABLE_DOT_PATHS) {
    o[p] = '__FILL_EN__'
  }
  return o
}

function setDeepStringPath(root: Record<string, unknown>, dotPath: string, value: string): void {
  const segments = dotPath.split('.')
  let cur: Record<string, unknown> = root
  for (let i = 0; i < segments.length - 1; i++) {
    const k = segments[i]!
    const next = cur[k]
    if (next == null || typeof next !== 'object' || Array.isArray(next)) {
      cur[k] = {}
    }
    cur = cur[k] as Record<string, unknown>
  }
  const last = segments[segments.length - 1]!
  cur[last] = value
}

function collectNestedFillStrings(
  obj: unknown,
  prefix: string,
  out: Record<string, string>,
): void {
  if (!isPlainObject(obj)) return
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') {
      const t = v.trim()
      if (t && FILL_PATH_SET.has(path)) {
        out[path] = t
      }
    } else if (isPlainObject(v)) {
      collectNestedFillStrings(v, path, out)
    }
  }
}

/**
 * Accept either a flat object `{ "homepage.hero.title": "..." }` or a nested partial
 * tree whose string leaves match whitelisted paths.
 */
export function parseFillSlotsPatch(raw: unknown): Record<string, string> {
  if (!isPlainObject(raw)) return {}

  const flat: Record<string, string> = {}
  const topKeys = Object.keys(raw)
  const looksFlat =
    topKeys.length > 0 &&
    topKeys.every((k) => k.includes('.') && /^[a-zA-Z][\w.]*$/.test(k))

  if (looksFlat) {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v !== 'string') continue
      const t = v.trim()
      if (!t || !FILL_PATH_SET.has(k)) continue
      flat[k] = t
    }
    return flat
  }

  collectNestedFillStrings(raw, '', flat)
  return flat
}

/**
 * Applies only whitelist paths with non-empty trimmed strings; mutates `cfg`.
 * @returns number of paths written
 */
export function applyAllowedFillPatches(cfg: AmzSiteConfig, flat: Record<string, string>): number {
  let n = 0
  const root = cfg as unknown as Record<string, unknown>
  for (const [path, value] of Object.entries(flat)) {
    if (!FILL_PATH_SET.has(path)) continue
    const t = typeof value === 'string' ? value.trim() : ''
    if (!t) continue
    setDeepStringPath(root, path, t)
    n++
  }
  return n
}
