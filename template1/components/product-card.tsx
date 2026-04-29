import { Product } from "@/lib/data"
import { Check, X, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ProductCardProps {
  product: Product
  rank?: number
}

export function ProductCard({ product, rank }: ProductCardProps) {

  return (
    <div className="bg-card rounded-xl border border-border p-5 hover:border-primary/50 transition-colors">
      <div className="flex flex-col md:flex-row gap-5">
        {/* Product Image */}
        <div className="relative w-full md:w-40 h-32 md:h-40 bg-muted rounded-lg flex-shrink-0 flex items-center justify-center">
          {rank && (
            <div className="absolute -top-2 -left-2 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">
              #{rank}
            </div>
          )}
          <span className="text-4xl">📦</span>
        </div>

        {/* Product Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg text-foreground mb-3">{product.name}</h3>

          {/* Pros & Cons */}
          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Strengths</p>
              <ul className="space-y-1">
                {product.pros.slice(0, 3).map((pro) => (
                  <li key={pro} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-foreground">{pro}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Drawbacks</p>
              <ul className="space-y-1">
                {product.cons.slice(0, 2).map((con) => (
                  <li key={con} className="flex items-start gap-2 text-sm">
                    <X className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <span className="text-foreground">{con}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Verdict */}
          <p className="text-sm text-muted-foreground mb-4 bg-muted/50 p-3 rounded-lg">
            <span className="font-medium text-foreground">Verdict:</span> {product.verdict}
          </p>

          {/* CTA */}
          <Button asChild className="w-full sm:w-auto">
            <a
              href={product.amazonLink}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex items-center gap-2"
            >
              View on Amazon
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}
