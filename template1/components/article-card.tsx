import Image from "next/image"
import Link from "next/link"
import { Article } from "@/lib/data"
import { Clock } from "lucide-react"

interface ArticleCardProps {
  article: Article
  showAuthor?: boolean
}

export function ArticleCard({ article, showAuthor = true }: ArticleCardProps) {
  return (
    <article className="group bg-card rounded-xl overflow-hidden border border-border hover:border-primary/40 hover:shadow-md transition-all duration-300">
      <Link href={`/article/${article.slug}`}>
        <div className="relative aspect-video bg-muted overflow-hidden">
          <Image
            src={article.featuredImage}
            alt={article.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
          />
        </div>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded">
              {article.category}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {article.readTime} min
            </span>
          </div>
          <h3 className="font-serif text-base font-bold text-foreground mb-2 line-clamp-2 group-hover:text-primary transition-colors text-balance leading-snug">
            {article.title}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-2 mb-4 leading-relaxed">
            {article.excerpt}
          </p>
          {showAuthor && (
            <div className="flex items-center gap-2 pt-3 border-t border-border">
              <div className="relative w-7 h-7 rounded-full overflow-hidden bg-muted flex-shrink-0">
                <Image src={article.author.avatar} alt={article.author.name} fill className="object-cover" />
              </div>
              <p className="text-xs font-medium text-foreground">{article.author.name}</p>
            </div>
          )}
        </div>
      </Link>
    </article>
  )
}
