import { headers } from 'next/headers.js'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import React from 'react'

import { ArticleBreadcrumbs } from '@/components/blog/ArticleBreadcrumbs'
import { ArticleLayoutAffiliateEditorial } from '@/components/blog/ArticleLayoutAffiliateEditorial'
import { ArticleLayoutAffiliateHub } from '@/components/blog/ArticleLayoutAffiliateHub'
import { ArticleRelated } from '@/components/blog/ArticleRelated'
import { blogPostingJsonLdString } from '@/components/blog/blogPostingJsonLd'
import { categoryIdsFromArticle, firstCategoryFromArticle } from '@/components/blog/articleHelpers'
import { AmzArticlePage as Amz1ArticlePage } from '@/site-layouts/amz-template-1/pages/AmzArticlePage'
import { AmzArticlePage as Amz2ArticlePage } from '@/site-layouts/amz-template-2/pages/AmzArticlePage'
import { Template1ArticlePage } from '@/components/template1/Template1ArticlePage'
import type { Media } from '@/payload-types'
import type { AppLocale } from '@/i18n/config'
import { hreflangTagForLocale, hreflangXDefaultUrl, isAppLocale } from '@/i18n/config'
import { stripLeadingDuplicateH1FromArticleHtml } from '@/utilities/articleHtmlDedupe'
import { lexicalStateToHtml } from '@/utilities/lexicalToHtml'
import { estimateReadingTimeMinutesFromHtml } from '@/utilities/readingTime'
import { getPublicBaseUrlFromHeaders, seoMetaForDocument } from '@/utilities/seoDocumentMeta'
import {
  getPublicSiteContext,
  isAmzSiteLayout,
  isAmzTemplate2Layout,
  isTemplateShellLayout,
} from '@/utilities/publicLandingTheme'
import { getArticleBySlugForSite, getRelatedArticlesForSite } from '@/utilities/publicSiteQueries'

type Props = { params: Promise<{ locale: string; slug: string }> }

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale: loc, slug: raw } = await props.params
  if (!isAppLocale(loc)) return { title: 'Not found' }
  const locale = loc
  const slug = decodeURIComponent(raw)
  const headersList = await headers()
  const { site, theme } = await getPublicSiteContext(headersList)
  if (!site) return { title: theme.browserTitle }
  const article = await getArticleBySlugForSite(site.id, slug, locale)
  if (!article) return { title: theme.browserTitle }
  const baseUrl = getPublicBaseUrlFromHeaders(headersList)
  const enc = encodeURIComponent(slug)

  const alternateLanguages: Record<string, string> = {}
  const hasByLocale: Partial<Record<AppLocale, boolean>> = {}
  for (const loc of theme.publicLocales) {
    const alt = await getArticleBySlugForSite(site.id, slug, loc)
    if (alt) {
      hasByLocale[loc] = true
      alternateLanguages[hreflangTagForLocale(loc)] = `${baseUrl}/${loc}/posts/${enc}`
    }
  }
  const xDefault = hreflangXDefaultUrl(
    baseUrl,
    `posts/${enc}`,
    hasByLocale,
    theme.defaultPublicLocale,
  )
  if (xDefault) alternateLanguages['x-default'] = xDefault

  return seoMetaForDocument(article, {
    siteName: theme.siteName,
    fallbackTitle: theme.browserTitle,
    path: `/${locale}/posts/${enc}`,
    baseUrl,
    alternateLanguages,
    openGraphKind: 'article',
    articleTimes: {
      publishedTime: article.publishedAt ?? article.createdAt,
      modifiedTime: article.updatedAt,
    },
  })
}

const breadcrumbHome: Record<AppLocale, string> = {
  zh: '首页',
  en: 'Home',
}

const relatedTitle: Record<AppLocale, string> = {
  zh: '继续阅读',
  en: 'Read next',
}

const readTimeLabel: Record<AppLocale, (n: number) => string> = {
  zh: (n) => `约 ${n} 分钟阅读`,
  en: (n) => `${n} min read`,
}

export default async function PostPage(props: Props) {
  const { locale: loc, slug: raw } = await props.params
  if (!isAppLocale(loc)) notFound()
  const locale = loc
  const slug = decodeURIComponent(raw)
  const headersList = await headers()
  const { site, theme } = await getPublicSiteContext(headersList)
  if (!site) notFound()
  const article = await getArticleBySlugForSite(site.id, slug, locale)
  if (!article) notFound()

  const baseUrl = getPublicBaseUrlFromHeaders(headersList)
  const pagePath = `/${locale}/posts/${encodeURIComponent(slug)}`
  const pageUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}${pagePath}` : pagePath

  const html = stripLeadingDuplicateH1FromArticleHtml(
    lexicalStateToHtml(article.body),
    article.title ?? '',
  )
  const readMinutes = estimateReadingTimeMinutesFromHtml(html, locale)
  const img =
    article.featuredImage != null &&
    typeof article.featuredImage === 'object' &&
    'url' in article.featuredImage &&
    typeof (article.featuredImage as Media).url === 'string'
      ? (article.featuredImage as Media).url
      : null
  const date =
    article.publishedAt != null
      ? new Date(article.publishedAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null
  const titleAlt = article.title?.trim() || theme.siteName
  const firstCat = firstCategoryFromArticle(article)
  const related = await getRelatedArticlesForSite(site.id, locale, {
    excludeId: article.id,
    categoryIds: categoryIdsFromArticle(article),
    limit: isAmzTemplate2Layout(theme.siteLayout) ? 8 : 3,
  })

  const baseNorm = baseUrl.replace(/\/$/, '')
  const publisherUrl = baseNorm ? `${baseNorm}/${locale}/` : pageUrl
  const breadcrumbTrail: { name: string; url: string }[] = [
    { name: breadcrumbHome[locale], url: `${baseNorm}/${locale}/` },
  ]
  if (firstCat?.slug) {
    breadcrumbTrail.push({
      name: (firstCat.name ?? firstCat.slug).trim() || firstCat.slug,
      url: `${baseNorm}/${locale}/categories/${encodeURIComponent(firstCat.slug)}`,
    })
  }
  breadcrumbTrail.push({ name: titleAlt, url: pageUrl })

  const jsonLd = blogPostingJsonLdString({
    article,
    pageUrl,
    featuredImageUrl: img,
    publisher: { name: theme.siteName, url: publisherUrl },
    breadcrumbItems: breadcrumbTrail,
  })

  const relatedEl = (
    <ArticleRelated articles={related} locale={locale} title={relatedTitle[locale]} />
  )

  const layout = article.affiliatePageLayout ?? 'default'

  const isTemplateShell = isTemplateShellLayout(theme.siteLayout)
  const isAmz = isAmzSiteLayout(theme.siteLayout)

  const amzArticle =
    isAmz && theme.amzSiteConfig ? (
      isAmzTemplate2Layout(theme.siteLayout) ? (
        <Amz2ArticlePage
          article={article}
          html={html}
          locale={locale}
          defaultPublicLocale={theme.defaultPublicLocale}
          readMinutes={readMinutes}
          readTimeLabel={readTimeLabel[locale]}
          related={related}
          titleAlt={titleAlt}
          config={theme.amzSiteConfig}
        />
      ) : (
        <Amz1ArticlePage
          article={article}
          html={html}
          locale={locale}
          defaultPublicLocale={theme.defaultPublicLocale}
          readMinutes={readMinutes}
          readTimeLabel={readTimeLabel[locale]}
          related={related}
          titleAlt={titleAlt}
          config={theme.amzSiteConfig}
        />
      )
    ) : null

  const defaultArticle = (
    <article
      className={
        isTemplateShell ? 'mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8' : 'blogArticle'
      }
    >
      <ArticleBreadcrumbs
        locale={locale}
        homeLabel={breadcrumbHome[locale]}
        category={firstCat}
        currentTitle={article.title}
      />
      <h1 className="blogArticleH1">{article.title}</h1>
      <div className="blogArticleMeta">
        {date ? <time dateTime={article.publishedAt ?? undefined}>{date}</time> : null}
        {date ? <span className="blogArticleMetaSep" aria-hidden /> : null}
        <span className="blogArticleReadTime">{readTimeLabel[locale](readMinutes)}</span>
      </div>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="blogArticleHero" src={img} alt={titleAlt} width={1200} height={630} />
      ) : null}
      <div className="blogArticleBody" dangerouslySetInnerHTML={{ __html: html }} />
      {relatedEl}
    </article>
  )

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
        suppressHydrationWarning
      />
      {amzArticle != null ? (
        amzArticle
      ) : isTemplateShell ? (
        <Template1ArticlePage
          article={article}
          html={html}
          locale={locale}
          readMinutes={readMinutes}
          related={related}
          theme={theme}
        />
      ) : layout === 'commercial_hub' ? (
        <ArticleLayoutAffiliateHub
          article={article}
          html={html}
          locale={locale}
          homeLabel={breadcrumbHome[locale]}
          readMinutes={readMinutes}
          readTimeLabel={readTimeLabel[locale]}
          related={relatedEl}
          titleAlt={titleAlt}
          variant="roundup"
        />
      ) : layout === 'product_comparison' ? (
        <ArticleLayoutAffiliateHub
          article={article}
          html={html}
          locale={locale}
          homeLabel={breadcrumbHome[locale]}
          readMinutes={readMinutes}
          readTimeLabel={readTimeLabel[locale]}
          related={relatedEl}
          titleAlt={titleAlt}
          variant="comparison"
        />
      ) : layout === 'editorial_review' ? (
        <ArticleLayoutAffiliateEditorial
          article={article}
          html={html}
          locale={locale}
          homeLabel={breadcrumbHome[locale]}
          readMinutes={readMinutes}
          readTimeLabel={readTimeLabel[locale]}
          related={relatedEl}
          titleAlt={titleAlt}
        />
      ) : (
        defaultArticle
      )}
    </>
  )
}
