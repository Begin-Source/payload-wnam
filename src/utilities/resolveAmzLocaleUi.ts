import type { AmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import type { AppLocale } from '@/i18n/config'

import { AMZ_NAV_LABELS_BY_HREF } from '@/utilities/amzBrowseUiStrings'
import { pickUiString } from '@/utilities/getLocalizedString'

export function resolveAmzNavigationMain(
  config: AmzSiteConfig,
  locale: AppLocale,
  defaultPublicLocale: AppLocale,
): { label: string; href: string }[] {
  const mainByLocale = config.navigation.mainByLocale
  const override =
    mainByLocale?.[locale] ?? mainByLocale?.[defaultPublicLocale]
  if (Array.isArray(override) && override.length > 0) {
    return override
  }
  return config.navigation.main.map((item) => {
    const pack = AMZ_NAV_LABELS_BY_HREF[item.href]
    const localized =
      pack != null ? pickUiString(locale, defaultPublicLocale, pack) : ''
    const label = localized.trim() || item.label
    return { ...item, label }
  })
}

type LocalizedPageFields = {
  title: string
  description: string
}

export function resolveAmzPageBlock(
  base: LocalizedPageFields & {
    byLocale?: Partial<Record<AppLocale, Partial<{ title?: string; description?: string }>>>
  },
  locale: AppLocale,
  defaultPublicLocale: AppLocale,
): LocalizedPageFields {
  const o = base.byLocale?.[locale] ?? base.byLocale?.[defaultPublicLocale]
  return {
    title: (o?.title?.trim() || base.title).trim(),
    description: (o?.description?.trim() || base.description).trim(),
  }
}

export function resolveAmzReviewsHero(
  config: AmzSiteConfig,
  locale: AppLocale,
  defaultPublicLocale: AppLocale,
  articleCount: number,
): LocalizedPageFields {
  const r = config.pages.reviews
  const { title, description: descTpl } = resolveAmzPageBlock(
    {
      title: r.title,
      description: r.description,
      byLocale: r.byLocale,
    },
    locale,
    defaultPublicLocale,
  )
  return {
    title,
    description: descTpl.replace(/\{count\}/g, String(articleCount)),
  }
}

export function resolveAmzGuidesHero(
  config: AmzSiteConfig,
  locale: AppLocale,
  defaultPublicLocale: AppLocale,
): LocalizedPageFields {
  const g = config.pages.guides
  return resolveAmzPageBlock(
    {
      title: g.title,
      description: g.description,
      byLocale: g.byLocale,
    },
    locale,
    defaultPublicLocale,
  )
}

export function resolveAmzProductsHero(
  config: AmzSiteConfig,
  locale: AppLocale,
  defaultPublicLocale: AppLocale,
): LocalizedPageFields & { indexNote?: string } {
  const p = config.pages.products
  const o = p.byLocale?.[locale] ?? p.byLocale?.[defaultPublicLocale]
  const { title, description } = resolveAmzPageBlock(
    {
      title: p.title,
      description: p.description,
      byLocale: p.byLocale,
    },
    locale,
    defaultPublicLocale,
  )
  const noteFromOverlay = o?.indexNote?.trim()
  const noteBase = p.indexNote?.trim()
  const indexNote = (noteFromOverlay || noteBase || undefined) as string | undefined
  return { title, description, indexNote }
}
