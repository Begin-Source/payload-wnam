import { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getArticleBySlug, getLatestArticles, articles } from "@/lib/data"
import { Clock, Calendar, ChevronRight, Star, ExternalLink, ShieldCheck, RefreshCw } from "lucide-react"

interface ArticlePageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params
  const article = getArticleBySlug(slug)
  if (!article) return { title: "Not Found" }
  return {
    title: article.title,
    description: article.excerpt,
    authors: [{ name: article.author.name }],
    openGraph: {
      title: article.title,
      description: article.excerpt,
      type: "article",
      publishedTime: article.publishDate,
      modifiedTime: article.updateDate,
      authors: [article.author.name],
    },
  }
}

export async function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }))
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params
  const article = getArticleBySlug(slug)
  if (!article) notFound()

  const related = getLatestArticles(20)
    .filter((a) => a.slug !== slug && a.categorySlug === article.categorySlug)
    .slice(0, 3)

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Review",
    headline: article.title,
    description: article.excerpt,
    datePublished: article.publishDate,
    dateModified: article.updateDate,
    author: {
      "@type": "Person",
      name: article.author.name,
      jobTitle: article.author.title,
      knowsAbout: article.author.expertise,
    },
    publisher: {
      "@type": "Organization",
      name: "TechReview Pro",
      url: "https://techreviewpro.com",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://techreviewpro.com/article/${article.slug}`,
    },
  }

  const faqJsonLd = article.faqs.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: article.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  } : null

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {faqJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      )}

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground mb-8">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="w-3 h-3 flex-shrink-0" />
          <Link href={`/category/${article.categorySlug}`} className="hover:text-foreground transition-colors capitalize">
            {article.category}
          </Link>
          <ChevronRight className="w-3 h-3 flex-shrink-0" />
          <span className="text-foreground line-clamp-1">{article.title}</span>
        </nav>

        <div className="flex flex-col lg:flex-row gap-12">
          {/* ── Main column ── */}
          <article className="flex-1 min-w-0">

            {/* Article header */}
            <header className="mb-8">
              <Link
                href={`/category/${article.categorySlug}`}
                className="inline-block text-xs font-semibold px-2.5 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors mb-4"
              >
                {article.category}
              </Link>

              <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground text-balance leading-tight mb-5">
                {article.title}
              </h1>

              <p className="text-lg text-muted-foreground leading-relaxed mb-6">
                {article.excerpt}
              </p>

              {/* Author + meta bar */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 py-4 border-y border-border">
                <Link href={`/author/${article.author.id}`} className="flex items-center gap-3 group w-fit">
                  <div className="relative w-12 h-12 rounded-full overflow-hidden bg-muted flex-shrink-0 border-2 border-border group-hover:border-primary transition-colors">
                    <Image src={article.author.avatar} alt={article.author.name} fill className="object-cover" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                      {article.author.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{article.author.experience}</p>
                  </div>
                </Link>

                <div className="sm:ml-auto flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(article.publishDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </span>
                  {article.updateDate !== article.publishDate && (
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5" />
                      Updated {new Date(article.updateDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {article.readTime} min read
                  </span>
                </div>
              </div>

              {/* Affiliate disclosure */}
              <div className="mt-4 flex items-start gap-2.5 p-3.5 bg-muted/60 rounded-lg border border-border">
                <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Affiliate Disclosure: </strong>
                  Some links in this article are Amazon affiliate links. We may earn a small commission if you purchase through them, at no extra cost to you. This has no effect on our ratings or editorial recommendations.
                </p>
              </div>
            </header>

            {/* Featured image */}
            <div className="relative w-full aspect-[16/9] rounded-xl overflow-hidden mb-8 bg-muted">
              <Image
                src={article.featuredImage}
                alt={article.title}
                fill
                className="object-cover"
                priority
              />
            </div>

            {/* Table of Contents */}
            {article.tableOfContents.length > 0 && (
              <div className="mb-10 p-5 bg-muted/50 rounded-xl border border-border">
                <h2 className="font-semibold text-sm text-foreground mb-3 uppercase tracking-wide">
                  In This Review
                </h2>
                <ol className="space-y-1.5">
                  {article.tableOfContents.map((item, i) => (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        className="flex items-center gap-2.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                      >
                        <span className="text-xs font-bold text-primary w-5 text-right flex-shrink-0">{i + 1}.</span>
                        {item.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Article content rendered as readable sections */}
            <div className="space-y-5 text-base text-foreground/90 leading-relaxed">
              {article.content
                .trim()
                .split("\n")
                .map((line, i) => {
                  const trimmed = line.trim()
                  if (!trimmed) return null
                  if (trimmed.startsWith("### ")) {
                    return (
                      <h3 key={i} id={trimmed.replace("### ", "").toLowerCase().replace(/\s+/g, "-")}
                        className="font-serif text-xl font-bold text-foreground mt-8 mb-3">
                        {trimmed.replace("### ", "")}
                      </h3>
                    )
                  }
                  if (trimmed.startsWith("## ")) {
                    return (
                      <h2 key={i} id={trimmed.replace("## ", "").toLowerCase().replace(/\s+/g, "-")}
                        className="font-serif text-2xl font-bold text-foreground mt-10 mb-4 pt-4 border-t border-border">
                        {trimmed.replace("## ", "")}
                      </h2>
                    )
                  }
                  if (trimmed.startsWith("- ")) {
                    return (
                      <ul key={i} className="list-none space-y-1.5 pl-0">
                        <li className="flex items-start gap-2 text-foreground/90">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-2" />
                          <span dangerouslySetInnerHTML={{ __html: trimmed.slice(2).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
                        </li>
                      </ul>
                    )
                  }
                  if (trimmed.startsWith("|")) {
                    return null // skip table rows — handled separately
                  }
                  if (/^\d+\./.test(trimmed)) {
                    return (
                      <p key={i} className="text-foreground/90"
                        dangerouslySetInnerHTML={{ __html: trimmed.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
                    )
                  }
                  return (
                    <p key={i} className="text-foreground/90"
                      dangerouslySetInnerHTML={{ __html: trimmed.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
                  )
                })}
            </div>

            {/* Product Cards */}
            {article.products.length > 0 && (
              <section className="mt-12" aria-label="Products Reviewed">
                <h2 className="font-serif text-2xl font-bold text-foreground mb-6">Products We Reviewed</h2>
                <div className="space-y-5">
                  {article.products.map((product, i) => (
                    <div key={product.name} className="border border-border rounded-xl overflow-hidden">
                      <div className="flex items-center gap-3 px-5 py-3 bg-muted/60 border-b border-border">
                        <span className="text-xs font-bold text-primary-foreground bg-primary px-2 py-0.5 rounded">
                          #{i + 1}
                        </span>
                        <h3 className="font-semibold text-foreground text-sm flex-1">{product.name}</h3>
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 fill-accent text-accent" />
                          <span className="font-bold text-foreground text-sm">{product.rating}</span>
                          <span className="text-xs text-muted-foreground">/10</span>
                        </div>
                      </div>
                      <div className="p-5">
                        <div className="flex flex-col sm:flex-row gap-5">
                          <div className="relative w-full sm:w-28 aspect-square sm:h-28 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                            <Image src={product.image} alt={product.name} fill className="object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="grid sm:grid-cols-2 gap-4 mb-4">
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pros</p>
                                <ul className="space-y-1">
                                  {product.pros.map((pro) => (
                                    <li key={pro} className="flex items-start gap-1.5 text-sm text-foreground">
                                      <span className="text-primary font-bold mt-0.5 flex-shrink-0">+</span>
                                      {pro}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Cons</p>
                                <ul className="space-y-1">
                                  {product.cons.map((con) => (
                                    <li key={con} className="flex items-start gap-1.5 text-sm text-foreground">
                                      <span className="text-destructive font-bold mt-0.5 flex-shrink-0">-</span>
                                      {con}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground italic border-l-2 border-primary pl-3 mb-4">
                              {product.verdict}
                            </p>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xl font-bold text-foreground">{product.price}</span>
                              <a
                                href={product.amazonLink}
                                target="_blank"
                                rel="nofollow noopener noreferrer"
                                className="flex items-center gap-1.5 px-4 py-2 bg-accent text-accent-foreground text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
                              >
                                View on Amazon
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* FAQ */}
            {article.faqs.length > 0 && (
              <section className="mt-12" aria-label="Frequently Asked Questions">
                <h2 className="font-serif text-2xl font-bold text-foreground mb-6">Frequently Asked Questions</h2>
                <div className="space-y-3">
                  {article.faqs.map((faq) => (
                    <div key={faq.question} className="border border-border rounded-xl p-5">
                      <h3 className="font-semibold text-foreground mb-2">{faq.question}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Author Bio — E-E-A-T */}
            <div className="mt-12 p-6 border border-border rounded-xl bg-muted/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">About the Author</p>
              <div className="flex items-start gap-4">
                <Link href={`/author/${article.author.id}`} className="flex-shrink-0">
                  <div className="relative w-16 h-16 rounded-full overflow-hidden bg-muted border-2 border-border">
                    <Image src={article.author.avatar} alt={article.author.name} fill className="object-cover" />
                  </div>
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/author/${article.author.id}`}>
                    <h3 className="font-serif font-bold text-lg text-foreground hover:text-primary transition-colors">
                      {article.author.name}
                    </h3>
                  </Link>
                  <p className="text-sm text-primary font-medium mb-2">{article.author.title}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">{article.author.bio}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {article.author.credentials.map((cred) => (
                      <span key={cred} className="text-xs px-2 py-1 bg-muted rounded-full text-muted-foreground border border-border">
                        {cred}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </article>

          {/* ── Sidebar ── */}
          <aside className="w-full lg:w-72 xl:w-80 flex-shrink-0">
            <div className="lg:sticky lg:top-24 space-y-6">

              {/* Quick jump to products */}
              {article.products.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-4 bg-muted/60 border-b border-border">
                    <h3 className="font-semibold text-sm text-foreground uppercase tracking-wide">Top Picks</h3>
                  </div>
                  <div className="divide-y divide-border">
                    {article.products.map((product, i) => (
                      <a
                        key={product.name}
                        href={product.amazonLink}
                        target="_blank"
                        rel="nofollow noopener noreferrer"
                        className="flex items-center gap-3 p-4 hover:bg-muted/40 transition-colors group"
                      >
                        <span className="text-xs font-bold text-primary-foreground bg-primary w-5 h-5 rounded flex items-center justify-center flex-shrink-0">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
                            {product.name}
                          </p>
                          <p className="text-xs text-muted-foreground">{product.price}</p>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Related articles */}
              {related.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-4 bg-muted/60 border-b border-border">
                    <h3 className="font-semibold text-sm text-foreground uppercase tracking-wide">Related Reviews</h3>
                  </div>
                  <div className="divide-y divide-border">
                    {related.map((rel) => (
                      <Link key={rel.id} href={`/article/${rel.slug}`} className="flex gap-3 p-4 hover:bg-muted/40 transition-colors group">
                        <div className="relative w-16 h-14 rounded-md overflow-hidden bg-muted flex-shrink-0">
                          <Image src={rel.featuredImage} alt={rel.title} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-primary font-medium mb-0.5">{rel.category}</p>
                          <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                            {rel.title}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                  <div className="p-4 border-t border-border">
                    <Link href="/" className="text-sm text-primary font-medium hover:underline">
                      All reviews &rarr;
                    </Link>
                  </div>
                </div>
              )}

              {/* Editorial integrity note */}
              <div className="p-4 bg-muted/50 rounded-xl border border-border">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">Editorial Independence: </strong>
                    Our reviewers have no knowledge of affiliate arrangements when writing reviews. Ratings are based solely on testing data.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}
