import type { MetadataRoute } from 'next'
import type { Payload, Where } from 'payload'

import {
  hreflangTagForLocale,
  hreflangXDefaultUrl,
  type AppLocale,
} from '@/i18n/config'

export const SITEMAP_BATCH_LIMIT = 500

/** Public marketing routes (exist under `[locale]/(frontend)/`). */
export const STATIC_SITEMAP_SEGMENTS = ['about', 'contact', 'privacy', 'search'] as const

/**
 * Sitemap hreflang when every enabled locale has a URL at `buildPath(loc)`.
 */
export function hreflangAlternatesForLocales(
  buildPath: (locale: AppLocale) => string,
  enabledLocales: readonly AppLocale[],
  siteDefaultLocale: AppLocale,
): MetadataRoute.Sitemap[0]['alternates'] | undefined {
  if (enabledLocales.length === 0) return undefined
  const languages: Record<string, string> = {}
  for (const loc of enabledLocales) {
    languages[hreflangTagForLocale(loc)] = buildPath(loc)
  }
  languages['x-default'] = buildPath(siteDefaultLocale)
  return { languages }
}

/**
 * hreflang for sitemap URLs where only some locales have content (posts, CMS pages).
 */
export function hreflangAlternatesSparse(
  baseUrl: string,
  pathAfterLocale: string,
  enabledLocales: readonly AppLocale[],
  siteDefaultLocale: AppLocale,
  hasDoc: (loc: AppLocale) => boolean,
): MetadataRoute.Sitemap[0]['alternates'] | undefined {
  const hasByLocale: Partial<Record<AppLocale, boolean>> = {}
  const languages: Record<string, string> = {}
  for (const loc of enabledLocales) {
    if (!hasDoc(loc)) continue
    hasByLocale[loc] = true
    languages[hreflangTagForLocale(loc)] = `${baseUrl}/${loc}/${pathAfterLocale}`
  }
  const xDefault = hreflangXDefaultUrl(
    baseUrl,
    pathAfterLocale,
    hasByLocale,
    siteDefaultLocale,
  )
  if (xDefault) languages['x-default'] = xDefault
  return Object.keys(languages).length ? { languages } : undefined
}

/** Defensive check for SEO plugin / future meta.robots. */
export function isSeoNoindexFromMeta(meta: unknown): boolean {
  if (!meta || typeof meta !== 'object') return false
  const m = meta as Record<string, unknown>
  if (m.noIndex === true || m.noindex === true) return true
  if (m.noIndex === 1 || m.noindex === 1) return true
  const robots = m.robots
  if (typeof robots === 'string' && /noindex/i.test(robots)) return true
  return false
}

export async function payloadFindAllForSitemap<T extends { id: number | string }>(
  payload: Payload,
  collection: 'articles' | 'pages' | 'categories',
  where: Where,
): Promise<T[]> {
  const all: T[] = []
  let page = 1
  for (;;) {
    const res = await payload.find({
      collection,
      where,
      limit: SITEMAP_BATCH_LIMIT,
      page,
      depth: 0,
      overrideAccess: true,
    })
    all.push(...(res.docs as T[]))
    if (res.docs.length < SITEMAP_BATCH_LIMIT) break
    page += 1
  }

  return all
}
