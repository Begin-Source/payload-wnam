import { Award, ChevronRight, Clock, FlaskConical, ShieldCheck } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

import { getPayload } from 'payload'

import { firstCategoryFromArticle } from '@/components/blog/articleHelpers'
import { mediaUrlForArticle } from '@/components/template1/lib/mediaUrl'
import config from '@/payload.config'
import type { AppLocale } from '@/i18n/config'
import type { Article, Author, Category, Media, Site } from '@/payload-types'
import type { PublicSiteTheme } from '@/utilities/publicLandingTheme'
import {
  applyTemplate1Placeholders,
  template1BlockForLocale,
  type Template1LocaleBlock,
} from '@/utilities/publicLandingTemplate1'
import { estimateReadingTimeMinutesFromHtml } from '@/utilities/readingTime'
import { lexicalStateToHtml } from '@/utilities/lexicalToHtml'

function authorHeadshotUrl(author: Article['author']): string | null {
  if (author == null || typeof author !== 'object' || !('headshot' in author)) return null
  const a = author as Author
  const h = a.headshot
  if (h == null) return null
  if (typeof h === 'object' && h !== null && 'url' in h) {
    const u = (h as Media).url
    return typeof u === 'string' ? u : null
  }
  return null
}

async function aboutImageUrlForTheme(theme: PublicSiteTheme): Promise<string | null> {
  const id = theme.aboutImageId
  if (id == null) return null
  try {
    const payload = await getPayload({ config: await config })
    const media = await payload.findByID({
      collection: 'media',
      id,
      depth: 0,
      overrideAccess: true,
    })
    return typeof media?.url === 'string' ? media.url : null
  } catch {
    return null
  }
}

function articleHref(locale: AppLocale, a: Article): string {
  const slug = a.slug?.trim()
  if (slug) return `/${locale}/posts/${encodeURIComponent(slug)}`
  return `/${locale}/posts/id-${a.id}`
}

export type Template1HomePageProps = {
  locale: AppLocale
  site: Site
  theme: PublicSiteTheme
  articles: Article[]
  categories: Category[]
}

export async function Template1HomePage(props: Template1HomePageProps) {
  const { locale, site, theme, articles, categories } = props
  const t = template1BlockForLocale(theme.template1, locale)
  const featured = articles[0]
  const rest = articles.slice(1)
  const picks = articles.slice(0, 4)
  const aboutImg = await aboutImageUrlForTheme(theme)

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-12 lg:flex-row">
        <div className="min-w-0 flex-1">
          <div className="mb-8 border-b border-border pb-6">
            <h1 className="text-balance font-serif text-3xl font-bold leading-tight text-foreground md:text-4xl">
              {t.homeTitle}
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">{t.homeSubtitle}</p>
          </div>

          {featured ? <FeaturedArticle locale={locale} article={featured} t={t} /> : null}

          <div className="mb-8 border-t border-border" />

          <div className="divide-y divide-border space-y-0">
            {rest.map((article) => (
              <ArticleListRow key={article.id} locale={locale} article={article} t={t} />
            ))}
          </div>
        </div>

        <aside className="w-full flex-shrink-0 lg:w-80 xl:w-96">
          <div className="space-y-8 lg:sticky lg:top-24">
            <SidebarAbout locale={locale} site={site} theme={theme} aboutImg={aboutImg} t={t} />
            <SidebarTopPicks locale={locale} articles={picks} t={t} />
            <SidebarCategories locale={locale} categories={categories} t={t} />
            <SidebarTrust locale={locale} t={t} />
          </div>
        </aside>
      </div>
    </div>
  )
}

function FeaturedArticle({
  locale,
  article,
  t,
}: {
  locale: AppLocale
  article: Article
  t: Template1LocaleBlock
}) {
  const href = articleHref(locale, article)
  const img = mediaUrlForArticle(article.featuredImage)
  const cat = firstCategoryFromArticle(article)
  const html = lexicalStateToHtml(article.body)
  const readM = Math.max(1, estimateReadingTimeMinutesFromHtml(html, locale))
  const minReadText = applyTemplate1Placeholders(t.minRead, { n: readM })
  const date =
    article.publishedAt != null
      ? new Date(article.publishedAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : null
  const author = article.author
  const headshot = authorHeadshotUrl(author)
  const authorName =
    author != null && typeof author === 'object' && 'displayName' in author
      ? (author as Author).displayName
      : null

  return (
    <article className="group mb-10">
      <Link href={href} className="block">
        <div className="relative mb-5 aspect-[16/8] w-full overflow-hidden rounded-xl bg-muted">
          {img ? (
            <Image
              src={img}
              alt={article.title}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              priority
              sizes="(max-width: 1024px) 100vw, 896px"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          {cat ? (
            <div className="absolute bottom-4 left-4">
              <span className="inline-block rounded bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary">
                {cat.name}
              </span>
            </div>
          ) : null}
        </div>
      </Link>
      <div className="mb-3 flex items-center gap-3">
        <span className="flex items-center gap-1 text-sm text-muted-foreground">
          <Clock className="h-3 w-3" />
          {minReadText}
        </span>
        {date ? (
          <span className="text-sm text-muted-foreground">
            {t.updated} {date}
          </span>
        ) : null}
      </div>
      <Link href={href} className="group/link">
        <h2 className="mb-3 text-balance font-serif text-2xl font-bold leading-snug text-foreground transition-colors group-hover/link:text-primary md:text-3xl">
          {article.title}
        </h2>
      </Link>
      {article.excerpt ? (
        <p className="mb-4 text-base leading-relaxed text-muted-foreground">{article.excerpt}</p>
      ) : null}
      {authorName ? (
        <div className="flex items-center gap-2">
          {headshot ? (
            <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={headshot} alt="" className="h-full w-full object-cover" width={32} height={32} />
            </div>
          ) : null}
          <span className="text-sm font-medium text-foreground">{authorName}</span>
        </div>
      ) : null}
    </article>
  )
}

function ArticleListRow({
  locale,
  article,
  t,
}: {
  locale: AppLocale
  article: Article
  t: Template1LocaleBlock
}) {
  const href = articleHref(locale, article)
  const img = mediaUrlForArticle(article.featuredImage)
  const cat = firstCategoryFromArticle(article)
  const html = lexicalStateToHtml(article.body)
  const readM = Math.max(1, estimateReadingTimeMinutesFromHtml(html, locale))
  const minReadText = applyTemplate1Placeholders(t.minRead, { n: readM })
  const date =
    article.publishedAt != null
      ? new Date(article.publishedAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : null
  const author = article.author
  const headshot = authorHeadshotUrl(author)
  const authorName =
    author != null && typeof author === 'object' && 'displayName' in author
      ? (author as Author).displayName
      : null

  return (
    <article className="group py-8 first:pt-0">
      <div className="flex flex-col gap-5 sm:flex-row">
        <Link href={href} className="sm:flex-shrink-0">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted sm:h-36 sm:w-52 sm:aspect-auto">
            {img ? (
              <Image
                src={img}
                alt={article.title}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                sizes="(max-width: 640px) 100vw, 208px"
              />
            ) : null}
          </div>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {cat ? (
              <span className="inline-block rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {cat.name}
              </span>
            ) : null}
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {minReadText}
            </span>
            {date ? <span className="text-xs text-muted-foreground">{date}</span> : null}
          </div>
          <Link href={href}>
            <h2 className="mb-2 text-balance font-serif text-lg font-bold leading-snug text-foreground transition-colors group-hover:text-primary">
              {article.title}
            </h2>
          </Link>
          {article.excerpt ? (
            <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{article.excerpt}</p>
          ) : null}
          {authorName ? (
            <Link href={href} className="group/author flex w-fit items-center gap-2">
              {headshot ? (
                <div className="relative h-6 w-6 flex-shrink-0 overflow-hidden rounded-full bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={headshot} alt="" className="h-full w-full object-cover" width={24} height={24} />
                </div>
              ) : null}
              <span className="text-xs font-medium text-foreground transition-colors group-hover/author:text-primary">
                {authorName}
              </span>
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function SidebarAbout({
  locale,
  site,
  theme,
  aboutImg,
  t,
}: {
  locale: AppLocale
  site: Site
  theme: PublicSiteTheme
  aboutImg: string | null
  t: Template1LocaleBlock
}) {
  const about = `/${locale}/about`
  const aboutHeading = applyTemplate1Placeholders(t.aboutSidebarTitle, { siteName: theme.siteName })
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="bg-primary px-5 py-4 text-primary-foreground">
        <h2 className="text-sm font-semibold uppercase tracking-wide">{aboutHeading}</h2>
      </div>
      <div className="px-5 py-5">
        {theme.aboutBio ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{theme.aboutBio}</p>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">{site.name}</p>
        )}
        {aboutImg ? (
          <div className="relative mt-4 aspect-video w-full overflow-hidden rounded-lg bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={aboutImg} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}
        <Link
          href={theme.aboutCtaHref && theme.aboutCtaHref !== '#' ? theme.aboutCtaHref : about}
          className="mt-5 flex w-full items-center justify-center rounded-lg border border-primary py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          {theme.aboutCtaLabel?.trim() ? theme.aboutCtaLabel : t.fullStory}
        </Link>
      </div>
    </div>
  )
}

function SidebarTopPicks({
  locale,
  articles,
  t,
}: {
  locale: AppLocale
  articles: Article[]
  t: Template1LocaleBlock
}) {
  const withImage = articles.filter((a) => mediaUrlForArticle(a.featuredImage))
  if (withImage.length === 0) return null
  const [first, ...more] = withImage
  const cat = firstCategoryFromArticle(first)
  const bestInLine = cat
    ? applyTemplate1Placeholders(t.bestIn, { category: cat.name })
    : null

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center gap-2 bg-accent px-5 py-4 text-accent-foreground">
        <Award className="h-4 w-4" />
        <h3 className="text-sm font-semibold uppercase tracking-wide">{t.topPicks}</h3>
      </div>
      <div className="space-y-5 p-4">
        <div className="group">
          <Link href={articleHref(locale, first)} className="block">
            <div className="relative mb-3 aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-muted">
              {mediaUrlForArticle(first.featuredImage) ? (
                <Image
                  src={mediaUrlForArticle(first.featuredImage)!}
                  alt={first.title}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  sizes="(max-width: 1024px) 100vw, 384px"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
              {cat ? (
                <span className="absolute top-2.5 left-2.5 rounded bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                  {cat.name}
                </span>
              ) : null}
            </div>
          </Link>
          {cat && bestInLine ? (
            <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{bestInLine}</p>
          ) : null}
          <Link href={articleHref(locale, first)} className="group/link">
            <p className="mb-2 font-serif text-base leading-snug font-bold text-balance text-foreground transition-colors group-hover/link:text-primary">
              {first.title}
            </p>
          </Link>
          {first.excerpt ? (
            <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{first.excerpt}</p>
          ) : null}
          <Link
            href={articleHref(locale, first)}
            className="inline-block rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            {t.fullReview}
          </Link>
        </div>
        {more.length > 0 ? (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t.moreTopPicks}</p>
            {more.map((a) => {
              const c = firstCategoryFromArticle(a)
              const u = mediaUrlForArticle(a.featuredImage)
              return (
                <div key={a.id} className="group flex items-center gap-3">
                  <Link href={articleHref(locale, a)} className="flex-shrink-0">
                    <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-border bg-muted">
                      {u ? (
                        <Image src={u} alt={a.title} fill className="object-cover" sizes="64px" />
                      ) : null}
                    </div>
                  </Link>
                  <div className="min-w-0 flex-1">
                    {c ? <p className="mb-0.5 text-xs text-muted-foreground">{c.name}</p> : null}
                    <Link href={articleHref(locale, a)}>
                      <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
                        {a.title}
                      </p>
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function SidebarCategories({
  locale,
  categories,
  t,
}: {
  locale: AppLocale
  categories: Category[]
  t: Template1LocaleBlock
}) {
  if (categories.length === 0) return null
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="border-b border-border bg-muted/60 px-5 py-4">
        <h3 className="text-sm font-semibold tracking-wide text-foreground uppercase">{t.browseCategory}</h3>
      </div>
      <div className="divide-y divide-border">
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/${locale}/categories/${encodeURIComponent(cat.slug)}`}
            className="group flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-muted/50"
          >
            <span className="text-sm font-medium text-foreground transition-colors group-hover:text-primary">
              {cat.name}
            </span>
            <div className="flex items-center gap-2">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function SidebarTrust({ locale, t }: { locale: AppLocale; t: Template1LocaleBlock }) {
  const items = [
    { Icon: ShieldCheck, label: t.trust1Title, desc: t.trust1Desc },
    { Icon: FlaskConical, label: t.trust2Title, desc: t.trust2Desc },
    { Icon: Award, label: t.trust3Title, desc: t.trust3Desc },
  ]
  const about = `/${locale}/about`
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="border-b border-border bg-muted/60 px-5 py-4">
        <h3 className="text-sm font-semibold tracking-wide text-foreground uppercase">{t.whyTrust}</h3>
      </div>
      <div className="space-y-4 px-5 py-4">
        {items.map(({ Icon, label, desc }) => (
          <div key={label} className="flex gap-3">
            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{label}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          </div>
        ))}
        <Link href={about} className="mt-2 block text-sm font-medium text-primary hover:underline">
          {t.learnHowWeTest}
        </Link>
      </div>
    </div>
  )
}
