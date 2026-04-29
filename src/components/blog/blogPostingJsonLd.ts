import type { Article, Author, Media } from '@/payload-types'

type Args = {
  article: Article
  pageUrl: string
  featuredImageUrl: string | null
}

function safeJsonForScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export function blogPostingJsonLdString({ article, pageUrl, featuredImageUrl }: Args): string {
  const headline = (article.title ?? '').trim() || 'Article'
  const datePublished = article.publishedAt ?? article.createdAt
  const dateModified = article.updatedAt

  const author = article.author
  let authorLd: { '@type': 'Person'; name: string } | undefined
  if (typeof author === 'object' && author !== null && 'displayName' in author) {
    const a = author as Author
    const name = a.displayName?.trim()
    if (name) {
      authorLd = { '@type': 'Person', name }
    }
  }

  const image =
    typeof featuredImageUrl === 'string' && featuredImageUrl.length > 0
      ? featuredImageUrl
      : undefined

  const obj: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline,
    datePublished,
    dateModified,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': pageUrl,
    },
    url: pageUrl,
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
    obj.image = imgObj
  }
  if (authorLd) {
    obj.author = authorLd
  }
  if (article.excerpt) {
    obj.description = article.excerpt
  }

  return safeJsonForScript(obj)
}
