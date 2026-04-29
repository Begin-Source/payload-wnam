import { Award, ChevronRight, Clock, ShieldCheck, UserRound } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

import { firstCategoryFromArticle } from '@/components/blog/articleHelpers'
import { mediaUrlForArticle } from '@/components/template1/lib/mediaUrl'
import type { AppLocale } from '@/i18n/config'
import type { Article, Author, Media } from '@/payload-types'
import {
  applyTemplate1Placeholders,
  template1BlockForLocale,
  type Template1LocaleBlock,
} from '@/utilities/publicLandingTemplate1'
import type { PublicSiteTheme } from '@/utilities/publicLandingTheme'

function authorNameForArticle(article: Article): string | null {
  const author = article.author
  if (author != null && typeof author === 'object' && 'displayName' in author) {
    return (author as Author).displayName
  }
  return null
}

function authorRoleForArticle(article: Article): string | null {
  const author = article.author
  if (author != null && typeof author === 'object' && 'role' in author) {
    return (author as Author).role ?? null
  }
  return null
}

function authorHeadshotUrl(article: Article): string | null {
  const author = article.author
  if (author == null || typeof author !== 'object' || !('headshot' in author)) return null
  const headshot = (author as Author).headshot
  if (headshot != null && typeof headshot === 'object' && 'url' in headshot) {
    const url = (headshot as Media).url
    return typeof url === 'string' ? url : null
  }
  return null
}

function articleHref(locale: AppLocale, article: Article): string {
  const slug = article.slug?.trim()
  if (slug) return `/${locale}/posts/${encodeURIComponent(slug)}`
  return `/${locale}/posts/id-${article.id}`
}

function categoryHref(locale: AppLocale, article: Article): string | null {
  const category = firstCategoryFromArticle(article)
  if (!category?.slug) return null
  return `/${locale}/categories/${encodeURIComponent(category.slug)}`
}

function formatArticleDate(value: string | null | undefined, locale: AppLocale): string | null {
  if (!value) return null
  return new Date(value).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function RelatedTemplate1Articles({
  locale,
  related,
  t,
}: {
  locale: AppLocale
  related: Article[]
  t: Template1LocaleBlock
}) {
  if (related.length === 0) return null
  return (
    <section className="mt-12 border-t border-border pt-8" aria-label={t.moreTopPicks}>
      <h2 className="mb-5 font-serif text-2xl font-bold text-foreground">{t.moreTopPicks}</h2>
      <div className="grid gap-5 md:grid-cols-3">
        {related.map((article) => {
          const image = mediaUrlForArticle(article.featuredImage)
          const category = firstCategoryFromArticle(article)
          return (
            <article key={article.id} className="group">
              <Link href={articleHref(locale, article)} className="block">
                <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-lg border border-border bg-muted">
                  {image ? (
                    <Image
                      src={image}
                      alt={article.title}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  ) : null}
                </div>
              </Link>
              {category ? (
                <p className="mb-1 text-xs font-medium text-primary">{category.name}</p>
              ) : null}
              <Link href={articleHref(locale, article)}>
                <h3 className="line-clamp-2 font-serif text-base font-bold leading-snug text-foreground transition-colors group-hover:text-primary">
                  {article.title}
                </h3>
              </Link>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function TrustPanel({ locale, t }: { locale: AppLocale; t: Template1LocaleBlock }) {
  const items = [
    { label: t.trust1Title, desc: t.trust1Desc },
    { label: t.trust2Title, desc: t.trust2Desc },
    { label: t.trust3Title, desc: t.trust3Desc },
  ]
  return (
    <aside className="rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/60 px-5 py-4">
        <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
          {t.whyTrust}
        </h2>
      </div>
      <div className="space-y-4 p-5">
        {items.map((item) => (
          <div key={item.label} className="flex gap-3">
            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Award className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{item.label}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
            </div>
          </div>
        ))}
        <Link
          href={`/${locale}/about`}
          className="block text-sm font-medium text-primary hover:underline"
        >
          {t.learnHowWeTest}
        </Link>
      </div>
    </aside>
  )
}

export type Template1ArticlePageProps = {
  article: Article
  html: string
  locale: AppLocale
  readMinutes: number
  related: Article[]
  theme: PublicSiteTheme
}

export function Template1ArticlePage(props: Template1ArticlePageProps) {
  const { article, html, locale, readMinutes, related, theme } = props
  const t = template1BlockForLocale(theme.template1, locale)
  const category = firstCategoryFromArticle(article)
  const categoryUrl = categoryHref(locale, article)
  const image = mediaUrlForArticle(article.featuredImage)
  const date = formatArticleDate(article.publishedAt, locale)
  const readTime = applyTemplate1Placeholders(t.minRead, { n: Math.max(1, readMinutes) })
  const authorName = authorNameForArticle(article)
  const authorRole = authorRoleForArticle(article)
  const headshot = authorHeadshotUrl(article)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav
        aria-label="Breadcrumb"
        className="mb-8 flex items-center gap-1.5 text-xs text-muted-foreground"
      >
        <Link href={`/${locale}`} className="transition-colors hover:text-foreground">
          {locale === 'zh' ? '首页' : 'Home'}
        </Link>
        {category ? (
          <>
            <ChevronRight className="h-3 w-3 flex-shrink-0" />
            {categoryUrl ? (
              <Link href={categoryUrl} className="transition-colors hover:text-foreground">
                {category.name}
              </Link>
            ) : (
              <span>{category.name}</span>
            )}
          </>
        ) : null}
        <ChevronRight className="h-3 w-3 flex-shrink-0" />
        <span className="line-clamp-1 text-foreground">{article.title}</span>
      </nav>

      <div className="flex flex-col gap-12 lg:flex-row">
        <article className="min-w-0 flex-1">
          <header className="mb-8">
            {category ? (
              <p className="mb-4">
                {categoryUrl ? (
                  <Link
                    href={categoryUrl}
                    className="inline-block rounded bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                  >
                    {category.name}
                  </Link>
                ) : (
                  <span className="inline-block rounded bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    {category.name}
                  </span>
                )}
              </p>
            ) : null}

            <h1 className="mb-5 text-balance font-serif text-3xl font-bold leading-tight text-foreground md:text-5xl">
              {article.title}
            </h1>
            {article.excerpt ? (
              <p className="mb-6 text-lg leading-relaxed text-muted-foreground">
                {article.excerpt}
              </p>
            ) : null}

            <div className="flex flex-col gap-4 border-y border-border py-4 sm:flex-row sm:items-center">
              {authorName ? (
                <div className="flex w-fit items-center gap-3">
                  <div className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                    {headshot ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={headshot} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <UserRound className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{authorName}</p>
                    {authorRole ? (
                      <p className="text-xs text-muted-foreground">{authorRole}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground sm:ml-auto">
                {date ? <span>{`${t.updated} ${date}`}</span> : null}
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {readTime}
                </span>
              </div>
            </div>

            {theme.affiliateDisclosureResolved ? (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-border bg-muted/60 p-3.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  <strong className="text-foreground">{t.footerAffiliateLabel} </strong>
                  {theme.affiliateDisclosureResolved}
                </p>
              </div>
            ) : null}
          </header>

          {image ? (
            <div className="relative mb-8 aspect-[16/9] overflow-hidden rounded-xl bg-muted">
              <Image
                src={image}
                alt={article.title}
                fill
                className="object-cover"
                priority
                sizes="(max-width: 1024px) 100vw, 896px"
              />
            </div>
          ) : null}

          <div className="blogArticleBody" dangerouslySetInnerHTML={{ __html: html }} />
          <RelatedTemplate1Articles locale={locale} related={related} t={t} />
        </article>

        <div className="w-full flex-shrink-0 lg:w-80 xl:w-96">
          <div className="space-y-6 lg:sticky lg:top-24">
            <TrustPanel locale={locale} t={t} />
            {theme.aboutBio ? (
              <aside className="rounded-xl border border-border bg-card p-5">
                <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground uppercase">
                  {applyTemplate1Placeholders(t.aboutSidebarTitle, { siteName: theme.siteName })}
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{theme.aboutBio}</p>
                <Link
                  href={
                    theme.aboutCtaHref && theme.aboutCtaHref !== '#'
                      ? theme.aboutCtaHref
                      : `/${locale}/about`
                  }
                  className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
                >
                  {theme.aboutCtaLabel?.trim() ? theme.aboutCtaLabel : t.fullStory}
                </Link>
              </aside>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
