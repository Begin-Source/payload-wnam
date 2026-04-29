"use client"

import { useState } from "react"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { ExternalLink, ChevronUp, X } from "lucide-react"
import { articles } from "@/lib/data"
import type { Product } from "@/lib/data"

function getProductsForPath(pathname: string): { products: Product[]; label: string } {
  // On an article page: show that article's products
  const articleMatch = pathname.match(/^\/article\/(.+)$/)
  if (articleMatch) {
    const slug = articleMatch[1]
    const article = articles.find((a) => a.slug === slug)
    if (article && article.products.length > 0) {
      return { products: article.products, label: "Products in this review" }
    }
  }

  // On a category page: show products from articles in that category
  const categoryMatch = pathname.match(/^\/category\/(.+)$/)
  if (categoryMatch) {
    const slug = categoryMatch[1]
    const categoryArticles = articles.filter((a) => a.categorySlug === slug)
    const products = categoryArticles.flatMap((a) => a.products).slice(0, 5)
    if (products.length > 0) {
      return { products, label: "Top picks in this category" }
    }
  }

  // Fallback for all other pages: top pick from the most recent article
  const allProducts = articles.flatMap((a) => a.products)
  if (allProducts.length > 0) {
    return { products: allProducts.slice(0, 5), label: "Our top picks" }
  }

  return { products: [], label: "Our top picks" }
}

export function GlobalMobileStickyBar() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  const { products, label } = getProductsForPath(pathname)
  if (products.length === 0) return null

  const topProduct = products[0]

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
              <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
              <p className="font-semibold text-sm text-foreground">
                {products.length} product{products.length > 1 ? "s" : ""} recommended
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors text-muted-foreground"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Product list */}
          <div className="overflow-y-auto flex-1 divide-y divide-border">
            {products.map((product, i) => (
              <a
                key={`${product.name}-${i}`}
                href={product.amazonLink}
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="flex items-center gap-4 px-5 py-4 hover:bg-muted/40 active:bg-muted/60 transition-colors"
                onClick={() => setOpen(false)}
              >
                {/* Thumbnail with rank badge */}
                <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-muted border border-border flex-shrink-0">
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    className="object-cover"
                    sizes="48px"
                  />
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
          {/* Top product thumbnail */}
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

          {/* Expand button */}
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 active:scale-95 transition-all flex-shrink-0"
            aria-label={`View ${products.length} product picks`}
          >
            {products.length > 1 ? `${products.length} Picks` : "View on Amazon"}
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  )
}
