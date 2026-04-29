import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getArticlesByCategory } from "@/lib/data"
import { ArticleCard } from "@/components/article-card"
import { ChevronRight, Clock } from "lucide-react"

const categoryInfo: Record<string, { name: string; description: string }> = {
  electronics: {
    name: "Electronics",
    description: "In-depth reviews of headphones, smartphones, laptops, and other consumer electronics. Our team tests audio equipment, measures real-world battery life, and benchmarks performance — no spec-sheet summaries.",
  },
  home: {
    name: "Home",
    description: "Honest reviews of air purifiers, robot vacuums, kitchen appliances, and smart home devices. We test in real homes, not showrooms.",
  },
  fitness: {
    name: "Fitness",
    description: "Running shoes, gym equipment, and sports gear reviewed by a former professional athlete. Every product logged real miles and reps before we wrote a word.",
  },
  "home-office": {
    name: "Home Office",
    description: "Standing desks, monitors, and ergonomic accessories tested by people who work from home full-time. Stability, noise, and long-term durability matter here.",
  },
}

interface CategoryPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params
  const category = categoryInfo[slug]
  if (!category) return { title: "Category Not Found" }
  return {
    title: `${category.name} Reviews & Buying Guides`,
    description: category.description,
  }
}

export async function generateStaticParams() {
  return Object.keys(categoryInfo).map((slug) => ({ slug }))
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params
  const category = categoryInfo[slug]
  if (!category) notFound()

  const categoryArticles = getArticlesByCategory(slug)

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-8">
        <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground">{category.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-10 pb-8 border-b border-border">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground text-balance mb-3">
          {category.name} Reviews
        </h1>
        <p className="text-muted-foreground leading-relaxed max-w-3xl">{category.description}</p>
      </div>

      {/* Article list */}
      {categoryArticles.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground mb-6">
            {categoryArticles.length} {categoryArticles.length === 1 ? "review" : "reviews"}
          </p>
          <div className="space-y-0 divide-y divide-border">
            {categoryArticles.map((article) => (
              <article key={article.id} className="group py-8 first:pt-0">
                <div className="flex flex-col sm:flex-row gap-5">
                  <Link href={`/article/${article.slug}`} className="sm:flex-shrink-0">
                    <div className="relative w-full sm:w-52 aspect-[4/3] sm:h-36 rounded-lg overflow-hidden bg-muted">
                      <Image
                        src={article.featuredImage}
                        alt={article.title}
                        fill
                        className="object-cover group-hover:scale-[1.03] transition-transform duration-500"
                      />
                    </div>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium px-2 py-0.5 bg-primary/10 text-primary rounded">
                        {article.category}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {article.readTime} min read
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Updated{" "}
                        {new Date(article.updateDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <Link href={`/article/${article.slug}`}>
                      <h2 className="font-serif text-xl font-bold text-foreground group-hover:text-primary transition-colors text-balance leading-snug mb-2">
                        {article.title}
                      </h2>
                    </Link>
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed mb-3">
                      {article.excerpt}
                    </p>
                    <Link href={`/author/${article.author.id}`} className="flex items-center gap-2 w-fit group/author">
                      <div className="relative w-6 h-6 rounded-full overflow-hidden bg-muted flex-shrink-0">
                        <Image src={article.author.avatar} alt={article.author.name} fill className="object-cover" />
                      </div>
                      <span className="text-xs font-medium text-foreground group-hover/author:text-primary transition-colors">
                        {article.author.name}
                      </span>
                      <span className="text-xs text-muted-foreground">{article.author.title}</span>
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-20 border border-dashed border-border rounded-xl">
          <p className="text-muted-foreground">No reviews in this category yet.</p>
          <Link href="/" className="mt-3 inline-block text-sm text-primary font-medium hover:underline">
            Browse all reviews
          </Link>
        </div>
      )}
    </div>
  )
}
