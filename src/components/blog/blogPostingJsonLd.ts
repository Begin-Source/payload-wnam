import type { Article, Author, Media } from '@/payload-types'

type BreadcrumbEntry = { name: string; url: string }

type Args = {
  article: Article
  pageUrl: string
  featuredImageUrl: string | null
  /** Organization publisher for EEAT / Knowledge Graph alignment */
  publisher?: { name: string; url: string }
  /** Visible breadcrumb trail (Home → category → post). */
  breadcrumbItems?: BreadcrumbEntry[]
}

function safeJsonForScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

function personLdFromAuthor(author: Author | number | null | undefined): Record<string, unknown> | undefined {
  if (author == null || typeof author === 'number') return undefined
  const name = author.displayName?.trim()
  if (!name) return undefined
  const o: Record<string, unknown> = { '@type': 'Person', name }
  const hs = author.headshot
  if (typeof hs === 'object' && hs !== null && 'url' in hs) {
    const u = (hs as Media).url
    if (typeof u === 'string' && u.trim()) o.image = u.trim()
  }
  return o
}

export function blogPostingJsonLdString({
  article,
  pageUrl,
  featuredImageUrl,
  publisher,
  breadcrumbItems,
}: Args): string {
  const headline = (article.title ?? '').trim() || 'Article'
  const datePublished = article.publishedAt ?? article.createdAt
  const dateModified = article.updatedAt

  const authorLd = personLdFromAuthor(
    typeof article.author === 'object' ? article.author : undefined,
  )
  const reviewedByLd = personLdFromAuthor(
    typeof article.reviewedBy === 'object' ? article.reviewedBy : undefined,
  )

  const image =
    typeof featuredImageUrl === 'string' && featuredImageUrl.length > 0
      ? featuredImageUrl
      : undefined

  const blogPosting: Record<string, unknown> = {
    '@type': 'BlogPosting',
    headline,
    datePublished,
    dateModified,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': pageUrl,
    },
    url: pageUrl,
    ...(publisher
      ? {
          publisher: {
            '@type': 'Organization',
            name: publisher.name,
            url: publisher.url,
          },
        }
      : {}),
  }

  if (image) {
    const imgObj: { '@type': 'ImageObject'; url: string; width?: number; height?: number } = {
      '@type': 'ImageObject',
      url: image,
    }
    if (article.featuredImage && typeof article.featuredImage === 'object' && 'width' in article.featuredImage) {
      const m = article.featuredImage as Media
      if (typeof m.width === 'number') imgObj.width = m.width
      if (typeof m.height === 'number') imgObj.height = m.height
    }
    blogPosting.image = imgObj
  }
  if (authorLd) {
    blogPosting.author = authorLd
  }
  if (reviewedByLd) {
    blogPosting.reviewedBy = reviewedByLd
  }
  if (article.excerpt) {
    blogPosting.description = article.excerpt
  }

  const hasBreadcrumbs = Boolean(breadcrumbItems && breadcrumbItems.length > 0)
  if (hasBreadcrumbs && breadcrumbItems) {
    const breadcrumbList = {
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbItems.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: item.name,
        item: item.url,
      })),
    }
    return safeJsonForScript({
      '@context': 'https://schema.org',
      '@graph': [blogPosting, breadcrumbList],
    })
  }

  return safeJsonForScript({
    '@context': 'https://schema.org',
    ...blogPosting,
  })
}
