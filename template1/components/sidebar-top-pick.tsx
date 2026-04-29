import Image from "next/image"
import Link from "next/link"
import { ExternalLink, Award } from "lucide-react"
import { getLatestArticles } from "@/lib/data"

export function SidebarTopPick() {
  const articles = getLatestArticles(5)

  // Collect one top product per article (first product = editors top pick)
  const picks = articles
    .filter((a) => a.products.length > 0)
    .slice(0, 3)
    .map((a) => ({
      product: a.products[0],
      articleSlug: a.slug,
      articleTitle: a.title,
      category: a.category,
    }))

  if (picks.length === 0) return null

  const [featured, ...rest] = picks

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-accent text-accent-foreground flex items-center gap-2">
        <Award className="w-4 h-4" />
        <h3 className="font-semibold text-sm uppercase tracking-wide">Editor&apos;s Top Picks</h3>
      </div>

      <div className="p-4 space-y-5">
        {/* Featured pick — large image */}
        <div className="group">
          <Link href={`/article/${featured.articleSlug}`} className="block">
            <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden bg-muted mb-3 border border-border">
              <Image
                src={featured.product.image}
                alt={featured.product.name}
                fill
                className="object-cover group-hover:scale-[1.03] transition-transform duration-500"
                sizes="(max-width: 1024px) 100vw, 384px"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
              <span className="absolute top-2.5 left-2.5 text-xs font-semibold bg-accent text-accent-foreground px-2 py-0.5 rounded">
                {featured.category}
              </span>
            </div>
          </Link>

          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
            Best {featured.category}
          </p>
          <Link href={`/article/${featured.articleSlug}`} className="group/link">
            <p className="font-serif font-bold text-base text-foreground leading-snug group-hover/link:text-primary transition-colors text-balance mb-2">
              {featured.product.name}
            </p>
          </Link>
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3">
            {featured.product.verdict}
          </p>

          <div className="flex items-center gap-2">
            <a
              href={featured.product.amazonLink}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              View on Amazon
              <ExternalLink className="w-3 h-3" />
            </a>
            <Link
              href={`/article/${featured.articleSlug}`}
              className="px-3 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              Full Review
            </Link>
          </div>
        </div>

        {/* Remaining picks — compact rows with thumbnail */}
        {rest.length > 0 && (
          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              More Top Picks
            </p>
            {rest.map(({ product, articleSlug, category }, i) => (
              <div key={i} className="group flex items-center gap-3">
                {/* Thumbnail */}
                <Link href={`/article/${articleSlug}`} className="flex-shrink-0">
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-muted border border-border">
                    <Image
                      src={product.image}
                      alt={product.name}
                      fill
                      className="object-cover group-hover:scale-[1.04] transition-transform duration-300"
                      sizes="64px"
                    />
                  </div>
                </Link>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-0.5">{category}</p>
                  <Link href={`/article/${articleSlug}`}>
                    <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                      {product.name}
                    </p>
                  </Link>
                  <a
                    href={product.amazonLink}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1 font-medium"
                  >
                    View on Amazon
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
