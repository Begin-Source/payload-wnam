import React from 'react'

import { AmzLink } from '@/amz-template-1/AmzLink'
import type { AmzSiteConfig } from '@/amz-template-1/defaultSiteConfig'
import { amzNavHref } from '@/amz-template-1/amzNavHref'
import { normalizeGuideCategories } from '@/amz-template-1/lib/guide-categories'
import type { AppLocale } from '@/i18n/config'
import type { Article, Category } from '@/payload-types'

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
  config,
  articles,
  activeSlug,
  cmsGuideCategories = [],
}: {
  locale: AppLocale
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

  return (
    <div className="container mx-auto px-4 py-10">
      <header className="mx-auto max-w-3xl text-center">
        <h1 className="text-balance text-3xl font-bold text-foreground md:text-4xl">{g.title}</h1>
        <p className="mt-4 text-balance text-muted-foreground">{g.description}</p>
      </header>

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
            All guides
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

      {cta?.title ? (
        <section className="mt-16 rounded-lg border border-border bg-muted/40 p-8 text-center">
          <h2 className="text-xl font-semibold text-foreground">{cta.title}</h2>
          {cta.description ? <p className="mt-2 text-muted-foreground">{cta.description}</p> : null}
          {cta.primaryButton?.text ? (
            <AmzLink
              href={amzNavHref(locale, cta.primaryButton.href ?? '/reviews')}
              className="mt-4 inline-flex rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {cta.primaryButton.text}
            </AmzLink>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
