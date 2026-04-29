import Link from "next/link"
import { Author } from "@/lib/data"
import { Award, Briefcase, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

interface AuthorCardProps {
  author: Author
  className?: string
  variant?: "compact" | "full"
}

export function AuthorCard({ author, className, variant = "full" }: AuthorCardProps) {
  if (variant === "compact") {
    return (
      <Link 
        href={`/author/${author.id}`}
        className={cn("flex items-center gap-3 group", className)}
      >
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
          <span className="text-sm font-medium">{author.name[0]}</span>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
            {author.name}
          </p>
          <p className="text-xs text-muted-foreground">{author.title}</p>
        </div>
      </Link>
    )
  }

  return (
    <div className={cn("bg-card rounded-xl border border-border p-6", className)}>
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <span className="text-xl font-medium">{author.name[0]}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link 
              href={`/author/${author.id}`}
              className="font-semibold text-foreground hover:text-primary transition-colors"
            >
              {author.name}
            </Link>
            <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded-full">
              认证专家
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">{author.title}</p>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            {author.bio}
          </p>
          
          {/* Expertise Tags */}
          <div className="flex flex-wrap gap-2 mb-4">
            {author.expertise.slice(0, 4).map((skill) => (
              <span 
                key={skill}
                className="px-2 py-1 bg-muted text-muted-foreground text-xs rounded-md"
              >
                {skill}
              </span>
            ))}
          </div>

          {/* Credentials */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Briefcase className="w-4 h-4" />
              <span>{author.experience}</span>
            </div>
            {author.credentials.slice(0, 2).map((credential) => (
              <div key={credential} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Award className="w-4 h-4" />
                <span>{credential}</span>
              </div>
            ))}
          </div>

          {/* Social Links */}
          {Object.keys(author.socialLinks).length > 0 && (
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
              {author.socialLinks.twitter && (
                <a 
                  href={author.socialLinks.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="sr-only">Twitter</span>
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
                >
                  <span className="sr-only">LinkedIn</span>
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
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>个人网站</span>
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
