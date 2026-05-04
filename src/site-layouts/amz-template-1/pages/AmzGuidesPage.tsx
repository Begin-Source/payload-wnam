import React from 'react'

import { AmzLink } from '@/site-layouts/amz-template-1/AmzLink'
import { Button } from '@/site-layouts/amz-template-1/components/ui/button'
import type { AmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import { amzNavHref } from '@/site-layouts/amz-template-1/amzNavHref'
import { normalizeGuideCategories } from '@/site-layouts/amz-template-1/lib/guide-categories'
import type { AppLocale } from '@/i18n/config'
import type { Article, Category } from '@/payload-types'
import { AMZ_GUIDES_ALL } from '@/utilities/amzBrowseUiStrings'
import { pickUiString } from '@/utilities/getLocalizedString'
import { resolveAmzGuidesHero } from '@/utilities/resolveAmzLocaleUi'

import { AmzArticleCards } from './AmzArticleCards'

function articleMatchesGuide(article: Article, guideSlug: string, guideName: string): boolean {
  const cats = article.categories ?? []
  for (const c of cats) {
    if (typeof c !== 'object' || c === null) continue
    const slug = 'slug' in c ? String((c as { slug?: string }).slug ?? '') : ''
    const name = 'name' in c ? String((c as { name?: string }).name ?? '') : ''
    if (slug && slug === guideSlug) return true
    if (name && name === guideName) return true
  }
  return false
}

function articleHasCategoryId(article: Article, categoryId: number): boolean {
  const cats = article.categories ?? []
  for (const c of cats) {
    if (typeof c === 'number' && c === categoryId) return true
    if (typeof c === 'object' && c !== null && 'id' in c && (c as { id?: number }).id === categoryId) {
      return true
    }
  }
  return false
}

export function AmzGuidesPage({
  locale,
  defaultPublicLocale,
  config,
  articles,
  activeSlug,
  cmsGuideCategories = [],
}: {
  locale: AppLocale
  defaultPublicLocale: AppLocale
  config: AmzSiteConfig
  articles: Article[]
  activeSlug?: string | null
  /** kind=guide 的 CMS 分类：优先用作 chips；与 JSON fallback 互斥展示 */
  cmsGuideCategories?: Category[]
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
  const guideCats =
    cmsChips.length > 0 ? cmsChips.map(({ slug, name }) => ({ slug, name })) : jsonGuideCats

  const matchJson = activeSlug ? jsonGuideCats.find((gc) => gc.slug === activeSlug) : undefined
  const matchCms =
    cmsChips.length > 0 && activeSlug ? cmsChips.find((gc) => gc.slug === activeSlug) : undefined

  let filtered = articles
  if (cmsChips.length > 0 && matchCms) {
    filtered = articles.filter((a) => articleHasCategoryId(a, matchCms.cmsId))
  } else if (cmsChips.length === 0 && matchJson != null) {
    filtered = articles.filter((a) => articleMatchesGuide(a, matchJson.slug, matchJson.name))
  }

  const cta = g.cta
  const { title: heroTitle, description: heroDescription } = resolveAmzGuidesHero(
    config,
    locale,
    defaultPublicLocale,
  )
  const p = (m: Partial<Record<AppLocale, string>>) =>
    pickUiString(locale, defaultPublicLocale, m)
  const allGuidesLabel = p(AMZ_GUIDES_ALL)

  return (
    <main className="min-w-0 flex-1 overflow-x-clip">
      <div className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <h1 className="mb-4 text-balance text-4xl font-bold text-foreground md:text-5xl">{heroTitle}</h1>
            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground">{heroDescription}</p>
          </div>

          {guideCats.length > 0 ? (
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              <AmzLink
                href={amzNavHref(locale, '/guides')}
                className={`rounded-full border px-4 py-2 text-sm font-medium ${
                  !activeSlug
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-foreground hover:border-primary'
                }`}
              >
                {allGuidesLabel}
              </AmzLink>
              {guideCats.map((gc) => (
                <AmzLink
                  key={gc.slug}
                  href={`${amzNavHref(locale, '/guides')}?category=${encodeURIComponent(gc.slug)}`}
                  className={`rounded-full border px-4 py-2 text-sm font-medium ${
                    activeSlug === gc.slug
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-foreground hover:border-primary'
                  }`}
                >
                  {gc.name}
                </AmzLink>
              ))}
            </div>
          ) : null}

          <div className="mt-10">
            <AmzArticleCards articles={filtered} locale={locale} />
          </div>
        </div>
      </div>

      {cta?.title ? (
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-7xl">
              <div className="mx-auto max-w-4xl rounded-lg bg-primary/5 p-12 text-center">
                <h2 className="mb-4 text-3xl font-bold text-foreground">{cta.title}</h2>
                {cta.description ? (
                  <p className="mb-8 text-lg text-muted-foreground">{cta.description}</p>
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
