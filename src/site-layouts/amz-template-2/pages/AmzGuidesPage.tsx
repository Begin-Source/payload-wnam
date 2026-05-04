import React from 'react'

import { AmzLink } from '@/site-layouts/amz-template-2/AmzLink'
import { Button } from '@/site-layouts/amz-template-2/components/ui/button'
import type { AmzSiteConfig } from '@/site-layouts/amz-template-2/defaultSiteConfig'
import { amzNavHref } from '@/site-layouts/amz-template-2/amzNavHref'
import { normalizeGuideCategories } from '@/site-layouts/amz-template-2/lib/guide-categories'
import type { AppLocale } from '@/i18n/config'
import type { Article, Category } from '@/payload-types'
import { lexicalStateToHtml } from '@/utilities/lexicalToHtml'
import { estimateReadingTimeMinutesFromHtml } from '@/utilities/readingTime'
import { resolveAmzGuidesHero } from '@/utilities/resolveAmzLocaleUi'

import { AmzGuidesBrowseClient, type GuideNavItem } from './AmzGuidesBrowseClient'

export function AmzGuidesPage({
  locale,
  defaultPublicLocale,
  config,
  articles,
  activeSlug,
  cmsGuideCategories = [],
  initialSearch = '',
}: {
  locale: AppLocale
  defaultPublicLocale: AppLocale
  config: AmzSiteConfig
  articles: Article[]
  activeSlug?: string | null
  /** kind=guide 的 CMS 分类：优先用作 chips；与 JSON fallback 互斥展示 */
  cmsGuideCategories?: Category[]
  initialSearch?: string
}) {
  const g = config.pages.guides
  const cmsChips =
    cmsGuideCategories.length > 0
      ? cmsGuideCategories
          .filter((c) => c.slug && String(c.slug).trim())
          .map((c) => ({
            slug: String(c.slug).trim(),
            name: String(c.name ?? '').trim() || String(c.slug).trim(),
            cmsId: c.id as number,
          }))
      : []
  const jsonGuideCats = normalizeGuideCategories(g.categories ?? [])
  const guideCategoryMode: 'cms' | 'json' = cmsChips.length > 0 ? 'cms' : 'json'

  const guideNavItems: GuideNavItem[] =
    cmsChips.length > 0
      ? cmsChips.map(({ slug, name, cmsId }) => ({ slug, name, cmsId }))
      : jsonGuideCats.map(({ slug, name }) => ({ slug, name }))

  const readMinutesByArticleId: Record<number, number> = {}
  for (const a of articles) {
    const html = lexicalStateToHtml(a.body)
    readMinutesByArticleId[a.id] = estimateReadingTimeMinutesFromHtml(html, locale)
  }

  const cta = g.cta
  const { title: heroTitle, description: heroDescription } = resolveAmzGuidesHero(
    config,
    locale,
    defaultPublicLocale,
  )

  return (
    <main className="min-w-0 flex-1 overflow-x-clip">
      <div className="container mx-auto amz-page-x-gutter py-12 md:py-14 lg:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 flex w-full flex-col items-center">
            <h1 className="mb-4 w-full text-balance text-center text-4xl font-bold text-foreground md:text-5xl">
              {heroTitle}
            </h1>
            <div className="w-full max-w-2xl">
              <p className="!text-center text-lg leading-relaxed text-muted-foreground">{heroDescription}</p>
            </div>
          </div>

          <AmzGuidesBrowseClient
            locale={locale}
            defaultPublicLocale={defaultPublicLocale}
            articles={articles}
            guideNavItems={guideNavItems}
            guideCategoryMode={guideCategoryMode}
            readMinutesByArticleId={readMinutesByArticleId}
            initialCategorySlug={activeSlug ?? null}
            initialSearch={initialSearch}
          />
        </div>
      </div>

      {cta?.title ? (
        <section className="py-16">
          <div className="container mx-auto amz-page-x-gutter">
            <div className="mx-auto max-w-7xl">
              <div className="mx-auto max-w-4xl rounded-lg bg-primary/5 p-12 text-center">
                <h2 className="mb-4 text-3xl font-bold text-foreground">{cta.title}</h2>
                {cta.description ? (
                  <p className="mb-8 !text-center text-lg text-muted-foreground">{cta.description}</p>
                ) : null}
                {cta.primaryButton?.text ? (
                  <div className="flex justify-center">
                    <Button asChild size="lg">
                      <AmzLink href={amzNavHref(locale, cta.primaryButton.href ?? '/reviews')}>
                        {cta.primaryButton.text}
                      </AmzLink>
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  )
}
