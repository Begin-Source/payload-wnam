import Link from 'next/link'
import { ExternalLink, Sparkles } from 'lucide-react'
import React from 'react'

import { Button } from '@/site-layouts/amz-template-2/components/ui/button'
import { merchantCtaLabel } from '@/site-layouts/amz-template-2/lib/merchantCtaLabel'
import type { Offer } from '@/payload-types'

export function AmzOfferCard({ offer }: { offer: Offer }) {
  const amz = offer.amazon
  const img = amz?.imageUrl?.trim()
  const prime = amz?.primeEligible
  const href = offer.targetUrl?.trim() || '#'
  const cta = merchantCtaLabel(offer.network)

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No image</div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-2 text-base font-semibold text-foreground">{offer.title}</p>
        {prime ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-0.5 rounded bg-accent/15 px-1.5 py-0.5 font-medium text-accent">
              <Sparkles className="size-3 shrink-0" aria-hidden />
              Prime
            </span>
          </div>
        ) : null}
        <div className="mt-auto pt-4">
          <Button
            asChild
            className="w-full bg-accent font-semibold text-accent-foreground shadow-md transition-all hover:bg-accent/90 hover:shadow-lg"
            size="lg"
          >
            <Link href={href} target="_blank" rel="noopener sponsored noreferrer">
              {cta}
              <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
