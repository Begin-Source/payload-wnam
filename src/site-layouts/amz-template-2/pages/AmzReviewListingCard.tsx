'use client'

import { ExternalLink } from 'lucide-react'
import React from 'react'

import { AmzLink } from '@/site-layouts/amz-template-2/AmzLink'
import { Button } from '@/site-layouts/amz-template-2/components/ui/button'
import type { AppLocale } from '@/i18n/config'
import type { Article, Media, Offer } from '@/payload-types'

function networkLabel(network: Offer['network']): string {
  if (network && typeof network === 'object' && 'name' in network && network.name) {
    return String(network.name)
  }
  return 'Amazon'
}

function merchantButtonLabel(network: Offer['network'], override?: string): string {
  if (override?.trim()) return override.trim()
  const n = networkLabel(network).toLowerCase()
  if (n.includes('amazon')) return 'View on Amazon'
  return `View on ${networkLabel(network)}`
}

function featuredMediaUrl(featured: Article['featuredImage']): string | null {
  if (featured == null) return null
  if (typeof featured === 'object' && featured !== null && 'url' in featured) {
    const u = (featured as Media).url
    return typeof u === 'string' ? u : null
  }
  return null
}

function firstPopulatedOffer(article: Article): Offer | null {
  const ro = article.relatedOffers
  if (!Array.isArray(ro) || ro.length === 0) return null
  const first = ro[0]
  return first && typeof first === 'object' && 'id' in first ? (first as Offer) : null
}

export function AmzReviewListingCard({
  article,
  locale,
  readExpertLabel = 'Read Expert Review',
  merchantCtaLabel,
}: {
  article: Article
  locale: AppLocale
  readExpertLabel?: string
  merchantCtaLabel?: string
}) {
  const slug = article.slug?.trim() || ''
  const href = slug ? `/${locale}/posts/${encodeURIComponent(slug)}` : `/${locale}/posts/id-${article.id}`
  const offer = firstPopulatedOffer(article)
  const img =
    featuredMediaUrl(article.featuredImage)?.trim() ||
    (offer?.amazon?.imageUrl?.trim() ?? '') ||
    null
  const excerpt = article.excerpt?.trim() || ''
  const targetUrl = offer?.targetUrl?.trim() || ''
  const merchantLabel = offer ? merchantButtonLabel(offer.network, merchantCtaLabel) : ''

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-lg">
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No image</div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-6">
        <h3 className="mb-2 line-clamp-2 text-lg font-bold leading-snug text-foreground">{article.title}</h3>
        {excerpt ? (
          <p className="mb-4 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">{excerpt}</p>
        ) : (
          <div className="mb-4 min-h-[2.5rem] flex-1" />
        )}
      </div>
      <div className="flex flex-col gap-3 p-6 pt-0">
        <Button
          asChild
          className="w-full bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
          size="lg"
        >
          <AmzLink href={href}>{readExpertLabel}</AmzLink>
        </Button>
        {targetUrl ? (
          <Button
            asChild
            className="w-full bg-[#FF9900] font-semibold text-white shadow-md transition-all hover:bg-[#FF9900]/90 hover:shadow-lg"
            size="lg"
          >
            <a href={targetUrl} target="_blank" rel="noopener sponsored noreferrer">
              {merchantLabel}
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  )
}
