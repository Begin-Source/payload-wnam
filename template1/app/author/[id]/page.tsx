import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getAuthorById, articles, authors } from "@/lib/data"
import { ArticleCard } from "@/components/article-card"
import { Award, Briefcase, ChevronRight, ExternalLink, FileText } from "lucide-react"

interface AuthorPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: AuthorPageProps): Promise<Metadata> {
  const { id } = await params
  const author = getAuthorById(id)
  if (!author) return { title: "Author Not Found" }
  return {
    title: `${author.name} — ${author.title}`,
    description: author.bio,
  }
}

export async function generateStaticParams() {
  return authors.map((author) => ({ id: author.id }))
}

export default async function AuthorPage({ params }: AuthorPageProps) {
  const { id } = await params
  const author = getAuthorById(id)
  if (!author) notFound()

  const authorArticles = articles.filter((a) => a.author.id === author.id)

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: author.name,
    jobTitle: author.title,
    description: author.bio,
    worksFor: { "@type": "Organization", name: "TechReview Pro" },
    knowsAbout: author.expertise,
    sameAs: Object.values(author.socialLinks).filter(Boolean),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-10">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/about#team" className="hover:text-foreground transition-colors">Our Team</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">{author.name}</span>
        </nav>

        {/* Author profile */}
        <div className="flex flex-col sm:flex-row gap-7 mb-10 pb-10 border-b border-border">
          <div className="relative w-28 h-28 rounded-full overflow-hidden bg-muted flex-shrink-0 border-2 border-border">
            <Image src={author.avatar} alt={author.name} fill className="object-cover" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5 mb-1">
              <h1 className="font-serif text-3xl font-bold text-foreground">{author.name}</h1>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                Verified Expert
              </span>
            </div>
            <p className="text-base text-primary font-medium mb-3">{author.title}</p>
            <p className="text-muted-foreground leading-relaxed mb-5 max-w-2xl">{author.bio}</p>

            <div className="flex flex-wrap gap-5 text-sm text-muted-foreground mb-5">
              <span className="flex items-center gap-1.5">
                <Briefcase className="w-4 h-4 flex-shrink-0" />
                {author.experience}
              </span>
              <span className="flex items-center gap-1.5">
                <FileText className="w-4 h-4 flex-shrink-0" />
                {authorArticles.length} {authorArticles.length === 1 ? "review" : "reviews"} published
              </span>
            </div>

            {/* Social links */}
            <div className="flex items-center gap-4">
              {author.socialLinks.twitter && (
                <a
                  href={author.socialLinks.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Twitter"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
              )}
              {author.socialLinks.linkedin && (
                <a
                  href={author.socialLinks.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="LinkedIn"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </a>
              )}
              {author.socialLinks.website && (
                <a
                  href={author.socialLinks.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Website
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Expertise + Credentials */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div>
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-4">Areas of Expertise</h2>
            <div className="flex flex-wrap gap-2">
              {author.expertise.map((skill) => (
                <span key={skill} className="px-3 py-1.5 bg-muted border border-border rounded-full text-sm text-foreground">
                  {skill}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-4">Credentials</h2>
            <ul className="space-y-3">
              {author.credentials.map((cred) => (
                <li key={cred} className="flex items-start gap-2.5">
                  <Award className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-muted-foreground">{cred}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Author's articles */}
        <div>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-6">
            Reviews by {author.name}
          </h2>
          {authorArticles.length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-5">
              {authorArticles.map((article) => (
                <ArticleCard key={article.id} article={article} showAuthor={false} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No reviews published yet.</p>
          )}
        </div>
      </div>
    </>
  )
}
