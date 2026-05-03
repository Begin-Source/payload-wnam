import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import React from 'react'

import { AmzLink } from '@/site-layouts/amz-template-2/AmzLink'
import { amzNavHref } from '@/site-layouts/amz-template-2/amzNavHref'
import { Button } from '@/site-layouts/amz-template-2/components/ui/button'
import { merchantCtaLabel } from '@/site-layouts/amz-template-2/lib/merchantCtaLabel'
import type { AmzSiteConfig } from '@/site-layouts/amz-template-2/defaultSiteConfig'
import type { AppLocale } from '@/i18n/config'
import type { Offer } from '@/payload-types'

function networkLabel(network: Offer['network']): string {
  if (network && typeof network === 'object' && 'name' in network && network.name) {
    return String(network.name)
  }
  return 'Merchant'
}

export function AmzProductDetailPage({
  locale,
  offer,
  config,
}: {
  locale: AppLocale
  offer: Offer
  config: AmzSiteConfig
}) {
  const amz = offer.amazon
  const asin = amz?.asin?.trim() ?? ''
  const img = amz?.imageUrl?.trim()
  const href = offer.targetUrl?.trim() || '#'
  const brandName =
    typeof config?.brand?.name === 'string' && config.brand.name.trim()
      ? config.brand.name.trim()
      : 'Store'

  return (
    <main className="min-w-0 flex-1 overflow-x-clip">
      <div className="container mx-auto max-w-4xl px-4 py-12">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <AmzLink href={amzNavHref(locale, '/')} className="hover:text-foreground">
                Home
              </AmzLink>
            </li>
            <li aria-hidden>/</li>
            <li>
              <AmzLink href={amzNavHref(locale, '/products')} className="hover:text-foreground">
                Products
              </AmzLink>
            </li>
            <li aria-hidden>/</li>
            <li className="text-foreground">{offer.title}</li>
          </ol>
        </nav>

        <div className="mt-8 grid gap-10 md:grid-cols-2">
          <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-muted">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt="" className="h-full w-full object-contain p-4" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No image
              </div>
            )}
          </div>
          <div>
            {asin ? (
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">ASIN · {asin}</p>
            ) : null}
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground md:text-4xl">{offer.title}</h1>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                asChild
                className="bg-accent font-semibold text-accent-foreground shadow-md transition-all hover:bg-accent/90 hover:shadow-lg"
                size="lg"
              >
                <Link href={href} target="_blank" rel="noopener sponsored noreferrer">
                  {merchantCtaLabel(offer.network)}
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <AmzLink
                href={amzNavHref(locale, '/products')}
                className="inline-flex items-center justify-center rounded-md border border-border px-6 py-3 text-sm font-medium hover:bg-muted"
              >
                All products
              </AmzLink>
            </div>
            <p className="mt-8 text-xs text-muted-foreground">
              Prices and availability on {networkLabel(offer.network)} are subject to change. {brandName} may earn a
              commission from qualifying purchases.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
