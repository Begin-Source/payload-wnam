'use client'

import { ExternalLink } from 'lucide-react'
import React from 'react'

import { AmzLink } from '@/site-layouts/amz-template-2/AmzLink'
import { Button } from '@/site-layouts/amz-template-2/components/ui/button'
import { merchantCtaLabel as resolveMerchantCtaLabel } from '@/site-layouts/amz-template-2/lib/merchantCtaLabel'
import type { AppLocale } from '@/i18n/config'
import type { Offer } from '@/payload-types'

export function AmzFeaturedOfferCard({
  offer,
  locale,
  reviewSlug,
  excerpt,
  readReviewLabel = 'Read Expert Review',
  merchantCtaLabel,
}: {
  offer: Offer
  locale: AppLocale
  reviewSlug: string | null
  excerpt: string | null
  readReviewLabel?: string
  /** Overrides automatic "View on Amazon" / `View on {network}` */
  merchantCtaLabel?: string
}) {
  const img = offer.amazon?.imageUrl?.trim() || null
  const targetUrl = offer.targetUrl?.trim() || ''
  const merchantLabel = resolveMerchantCtaLabel(offer.network, merchantCtaLabel)
  const summary = excerpt?.trim() || ''

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
        <h3 className="mb-2 line-clamp-2 text-lg font-bold leading-snug text-foreground">{offer.title}</h3>
        {summary ? (
          <p className="mb-4 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">{summary}</p>
        ) : (
          <div className="mb-4 min-h-[2.5rem] flex-1" />
        )}
      </div>
      <div className="flex flex-col gap-3 p-6 pt-0">
        {reviewSlug ? (
          <Button
            asChild
            className="w-full bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
            size="lg"
          >
            <AmzLink href={`/${locale}/posts/${encodeURIComponent(reviewSlug)}`}>{readReviewLabel}</AmzLink>
          </Button>
        ) : null}
        {targetUrl ? (
          <Button
            asChild
            className="w-full bg-accent font-semibold text-accent-foreground shadow-md transition-all hover:bg-accent/90 hover:shadow-lg"
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
