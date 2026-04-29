"use client"

import { useState } from "react"
import Image from "next/image"
import { ExternalLink, ChevronUp, X } from "lucide-react"
import type { Product } from "@/lib/data"

interface MobileStickyBarProps {
  products: Product[]
  articleTitle: string
}

export function MobileStickyBar({ products, articleTitle }: MobileStickyBarProps) {
  const [open, setOpen] = useState(false)

  if (products.length === 0) return null

  // Top product is the highest-rated one
  const topProduct = [...products].sort((a, b) => b.rating - a.rating)[0]

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-foreground/40 z-40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Bottom Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 lg:hidden transition-transform duration-300 ease-in-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Product picks"
      >
        <div className="bg-card border-t border-border rounded-t-2xl shadow-2xl max-h-[70vh] flex flex-col">
          {/* Sheet header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Products in this review</p>
              <p className="font-semibold text-sm text-foreground line-clamp-1">{articleTitle}</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors text-muted-foreground"
              aria-label="Close product sheet"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Product list */}
          <div className="overflow-y-auto flex-1 divide-y divide-border">
            {products.map((product, i) => (
              <a
                key={product.name}
                href={product.amazonLink}
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="flex items-center gap-4 px-5 py-4 hover:bg-muted/40 active:bg-muted/60 transition-colors"
                onClick={() => setOpen(false)}
              >
                {/* Product thumbnail */}
                <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-muted border border-border flex-shrink-0">
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    className="object-cover"
                    sizes="48px"
                  />
                  {/* Rank badge overlaid */}
                  <span className="absolute top-0 left-0 w-5 h-5 bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center rounded-br-lg">
                    {i + 1}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground line-clamp-1">{product.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">View pricing on Amazon</p>
                </div>

                {/* CTA */}
                <div className="flex items-center gap-1.5 bg-accent text-accent-foreground text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0">
                  View
                  <ExternalLink className="w-3 h-3" />
                </div>
              </a>
            ))}
          </div>

          {/* Affiliate note */}
          <div className="px-5 py-3 bg-muted/40 border-t border-border flex-shrink-0">
            <p className="text-xs text-muted-foreground text-center">
              Affiliate links — we may earn a commission at no extra cost to you.
            </p>
          </div>
        </div>
      </div>

      {/* Collapsed sticky bar */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 lg:hidden transition-transform duration-300 ease-in-out ${
          open ? "translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="bg-card border-t border-border shadow-2xl px-4 py-3 flex items-center gap-3">
          {/* Product thumbnail */}
          <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-muted border border-border flex-shrink-0">
            <Image
              src={topProduct.image}
              alt={topProduct.name}
              fill
              className="object-cover"
              sizes="48px"
            />
          </div>

          {/* Top product info */}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground leading-none mb-1">Featured Product</p>
            <p className="text-sm font-semibold text-foreground line-clamp-1">{topProduct.name}</p>
          </div>

          {/* View all button */}
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 active:scale-95 transition-all flex-shrink-0"
            aria-label={`View all ${products.length} products`}
          >
            {products.length > 1 ? `${products.length} Picks` : "View on Amazon"}
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  )
}
