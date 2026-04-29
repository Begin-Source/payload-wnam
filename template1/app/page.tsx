import Image from "next/image"
import Link from "next/link"
import { getLatestArticles, authors, categories } from "@/lib/data"
import { Clock, Star, ChevronRight, ShieldCheck, Award, FlaskConical } from "lucide-react"
import { SidebarAbout } from "@/components/sidebar-about"
import { SidebarTopPick } from "@/components/sidebar-top-pick"

export default function HomePage() {
  const allArticles = getLatestArticles(20)
  const featured = allArticles[0]
  const rest = allArticles.slice(1)

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col lg:flex-row gap-12">
        {/* ── Main column ── */}
        <div className="flex-1 min-w-0">

          {/* Page heading */}
          <div className="mb-8 pb-6 border-b border-border">
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground text-balance leading-tight">
              Independent Product Reviews
            </h1>
            <p className="mt-2 text-muted-foreground text-base leading-relaxed">
              Every product tested by experts. Every review written without brand influence.
            </p>
          </div>

          {/* Featured article */}
          {featured && (
            <article className="group mb-10">
              <Link href={`/article/${featured.slug}`} className="block">
                <div className="relative w-full aspect-[16/8] rounded-xl overflow-hidden mb-5 bg-muted">
                  <Image
                    src={featured.featuredImage}
                    alt={featured.title}
                    fill
                    className="object-cover group-hover:scale-[1.02] transition-transform duration-500"
                    priority
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <div className="absolute bottom-4 left-4">
                    <CategoryBadge category={featured.category} />
                  </div>
                </div>
              </Link>
              <div className="flex items-center gap-3 mb-3">
                <ArticleMeta article={featured} />
              </div>
              <Link href={`/article/${featured.slug}`} className="group/link">
                <h2 className="font-serif text-2xl md:text-3xl font-bold text-foreground group-hover/link:text-primary transition-colors text-balance leading-snug mb-3">
                  {featured.title}
                </h2>
              </Link>
              <p className="text-muted-foreground leading-relaxed mb-4 text-base">
                {featured.excerpt}
              </p>
              <AuthorLine author={featured.author} />
            </article>
          )}

          <div className="border-t border-border mb-8" />

          {/* Article list */}
          <div className="space-y-0 divide-y divide-border">
            {rest.map((article) => (
              <article key={article.id} className="group py-8 first:pt-0">
                <div className="flex flex-col sm:flex-row gap-5">
                  <Link href={`/article/${article.slug}`} className="sm:flex-shrink-0">
                    <div className="relative w-full sm:w-52 aspect-[4/3] sm:aspect-auto sm:h-36 rounded-lg overflow-hidden bg-muted">
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
                      <CategoryBadge category={article.category} small />
                      <ArticleMeta article={article} small />
                    </div>
                    <Link href={`/article/${article.slug}`}>
                      <h2 className="font-serif text-lg font-bold text-foreground group-hover:text-primary transition-colors text-balance leading-snug mb-2">
                        {article.title}
                      </h2>
                    </Link>
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed mb-3">
                      {article.excerpt}
                    </p>
                    <AuthorLine author={article.author} small />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* ── Sidebar ── */}
        <aside className="w-full lg:w-80 xl:w-96 flex-shrink-0">
          <div className="lg:sticky lg:top-24 space-y-8">
            <SidebarAbout />
            <SidebarTopPick />
            <SidebarCategories />
            <SidebarTrust />
          </div>
        </aside>
      </div>
    </div>
  )
}

/* ── Sub-components ── */

function CategoryBadge({ category, small }: { category: string; small?: boolean }) {
  return (
    <span
      className={`inline-block font-medium rounded bg-primary/10 text-primary ${
        small ? "text-xs px-2 py-0.5" : "text-sm px-2.5 py-1"
      }`}
    >
      {category}
    </span>
  )
}

function ArticleMeta({
  article,
  small,
}: {
  article: { readTime: number; updateDate: string }
  small?: boolean
}) {
  const textSize = small ? "text-xs" : "text-sm"
  return (
    <span className={`flex items-center gap-3 text-muted-foreground ${textSize}`}>
      <span className="flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {article.readTime} min read
      </span>
      <span>
        Updated{" "}
        {new Date(article.updateDate).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </span>
    </span>
  )
}

function AuthorLine({ author, small }: { author: { id: string; name: string; title: string; avatar: string }; small?: boolean }) {
  return (
    <Link href={`/author/${author.id}`} className="flex items-center gap-2 group/author w-fit">
      <div className={`relative rounded-full overflow-hidden bg-muted flex-shrink-0 ${small ? "w-6 h-6" : "w-8 h-8"}`}>
        <Image src={author.avatar} alt={author.name} fill className="object-cover" />
      </div>
      <div>
        <span className={`font-medium text-foreground group-hover/author:text-primary transition-colors ${small ? "text-xs" : "text-sm"}`}>
          {author.name}
        </span>
        {!small && (
          <span className="text-xs text-muted-foreground ml-2">{author.title}</span>
        )}
      </div>
    </Link>
  )
}

function SidebarCategories() {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 bg-muted/60 border-b border-border">
        <h3 className="font-semibold text-sm text-foreground uppercase tracking-wide">Browse by Category</h3>
      </div>
      <div className="divide-y divide-border">
        {categories.map((cat) => (
          <Link
            key={cat.slug}
            href={`/category/${cat.slug}`}
            className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/50 transition-colors group"
          >
            <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
              {cat.name}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{cat.count} reviews</span>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function SidebarTrust() {
  const items = [
    {
      icon: ShieldCheck,
      label: "Editorially Independent",
      desc: "We never accept payment for positive coverage.",
    },
    {
      icon: FlaskConical,
      label: "Hands-On Tested",
      desc: "Every product reviewed is tested by our team in real-world conditions.",
    },
    {
      icon: Award,
      label: "Expert Authors",
      desc: "Our reviewers average 11 years of subject-matter experience.",
    },
  ]

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 bg-muted/60 border-b border-border">
        <h3 className="font-semibold text-sm text-foreground uppercase tracking-wide">Why Trust Us</h3>
      </div>
      <div className="px-5 py-4 space-y-4">
        {items.map(({ icon: Icon, label, desc }) => (
          <div key={label} className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
        <Link href="/about" className="block mt-2 text-sm font-medium text-primary hover:underline">
          Learn how we test &rarr;
        </Link>
      </div>
    </div>
  )
}
