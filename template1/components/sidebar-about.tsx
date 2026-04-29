import Image from "next/image"
import Link from "next/link"
import { authors } from "@/lib/data"

export function SidebarAbout() {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-primary text-primary-foreground">
        <h2 className="font-semibold text-sm uppercase tracking-wide">About TechReview Pro</h2>
      </div>

      <div className="px-5 py-5">
        <p className="text-sm text-muted-foreground leading-relaxed">
          We are an independent review publication staffed by experienced product experts. Every product we review is
          purchased or borrowed — never gifted in exchange for coverage. Our only goal is helping you make better
          buying decisions.
        </p>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 my-5">
          {[
            { value: "400+", label: "Products Tested" },
            { value: "12 yrs", label: "Avg. Experience" },
            { value: "100%", label: "Independent" },
          ].map(({ value, label }) => (
            <div key={label} className="text-center bg-muted/60 rounded-lg py-3 px-2">
              <p className="font-bold text-lg text-foreground leading-none">{value}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-tight">{label}</p>
            </div>
          ))}
        </div>

        {/* Team */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Meet Our Team</p>
          <div className="space-y-4">
            {authors.map((author) => (
              <Link key={author.id} href={`/author/${author.id}`} className="flex items-start gap-3 group">
                <div className="relative w-11 h-11 rounded-full overflow-hidden bg-muted flex-shrink-0 border-2 border-border group-hover:border-primary transition-colors">
                  <Image src={author.avatar} alt={author.name} fill className="object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-tight">
                    {author.name}
                  </p>
                  <p className="text-xs text-muted-foreground leading-tight mt-0.5">{author.title}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {author.expertise.slice(0, 2).map((e) => (
                      <span key={e} className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <Link
          href="/about"
          className="mt-5 flex items-center justify-center w-full py-2.5 rounded-lg border border-primary text-primary text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          Read Our Full Story
        </Link>
      </div>
    </div>
  )
}
