import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import React from 'react'

import type { Offer } from '@/payload-types'

function formatPrice(cents: number | null | undefined, currency: string | null | undefined): string {
  if (cents == null || !Number.isFinite(Number(cents))) return '—'
  const v = Number(cents) / 100
  const cur = currency?.trim() || 'USD'
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(v)
  } catch {
    return `$${v.toFixed(2)}`
  }
}

function networkLabel(network: Offer['network']): string {
  if (network && typeof network === 'object' && 'name' in network && network.name) {
    return String(network.name)
  }
  return 'Merchant'
}

export function AmzOfferCard({ offer }: { offer: Offer }) {
  const amz = offer.amazon
  const img = amz?.imageUrl?.trim()
  const rating = amz?.ratingAvg
  const rc = amz?.reviewCount
  const prime = amz?.primeEligible
  const href = offer.targetUrl?.trim() || '#'
  const cta = `View on ${networkLabel(offer.network)}`

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-[4/3] w-full bg-muted">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-full w-full object-contain p-2" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No image</div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-2 text-base font-semibold text-foreground">{offer.title}</p>
        <p className="mt-1 text-lg font-bold text-foreground">{formatPrice(amz?.priceCents ?? null, amz?.currency ?? null)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {typeof rating === 'number' && rating > 0 ? (
            <span>
              ★ {rating.toFixed(1)}
              {typeof rc === 'number' && rc > 0 ? ` (${rc})` : ''}
            </span>
          ) : null}
          {prime ? (
            <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-800 dark:text-amber-200">
              <Sparkles className="size-3 shrink-0" aria-hidden />
              Prime
            </span>
          ) : null}
        </div>
        <div className="mt-auto pt-4">
          <Link
            href={href}
            target="_blank"
            rel="noopener sponsored"
            className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {cta}
          </Link>
        </div>
      </div>
    </div>
  )
}
