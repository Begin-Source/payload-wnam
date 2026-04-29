import { getPageBySlugForSite } from '@/utilities/publicSiteQueries'
import type { AppLocale } from '@/i18n/config'

export async function resolveT1NavAboutLabel(
  siteId: number,
  locale: AppLocale,
  usePageTitle: boolean,
  fallback: string,
): Promise<string> {
  if (!usePageTitle) return fallback
  const p = await getPageBySlugForSite(siteId, 'about', locale)
  return p?.title?.trim() || fallback
}

export async function resolveT1NavContactLabel(
  siteId: number,
  locale: AppLocale,
  usePageTitle: boolean,
  fallback: string,
): Promise<string> {
  if (!usePageTitle) return fallback
  const p = await getPageBySlugForSite(siteId, 'contact', locale)
  return p?.title?.trim() || fallback
}
