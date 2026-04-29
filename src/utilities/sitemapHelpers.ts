import type { MetadataRoute } from 'next'
import type { Payload, Where } from 'payload'

import { defaultLocale, locales, type AppLocale } from '@/i18n/config'

export const SITEMAP_BATCH_LIMIT = 500

/** Public marketing routes (exist under `[locale]/(frontend)/`). */
export const STATIC_SITEMAP_SEGMENTS = ['about', 'contact', 'privacy', 'search'] as const

/**
 * Emit `alternates.languages` when both zh and en URLs exist (Next sitemap convention).
 */
export function hreflangAlternatesForLocales(
  buildPath: (locale: AppLocale) => string,
): MetadataRoute.Sitemap[0]['alternates'] | undefined {
  const langs: Partial<Record<AppLocale, string>> = {}
  for (const loc of locales) {
    langs[loc] = buildPath(loc)
  }
  const en = langs.en
  const zh = langs.zh
  if (!en || !zh) return undefined
  return {
    languages: {
      en,
      zh,
      'x-default': langs[defaultLocale] ?? en,
    },
  }
}

/** Defensive check for SEO plugin / future meta.robots. */
export function isSeoNoindexFromMeta(meta: unknown): boolean {
  if (!meta || typeof meta !== 'object') return false
  const m = meta as Record<string, unknown>
  if (m.noIndex === true || m.noindex === true) return true
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
