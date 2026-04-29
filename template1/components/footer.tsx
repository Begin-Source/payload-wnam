import Link from "next/link"

export function Footer() {
  return (
    <footer className="bg-foreground text-primary-foreground mt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <div className="h-8 w-8 rounded bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-xs">TR</span>
              </div>
              <span className="font-serif font-bold text-lg">TechReview Pro</span>
            </Link>
            <p className="text-sm leading-relaxed" style={{ color: "oklch(0.75 0 0)" }}>
              Independent product reviews written by experienced experts. We buy everything we test and never accept payment for coverage.
            </p>
            <div className="mt-5 p-3 rounded border" style={{ borderColor: "oklch(0.35 0 0)", backgroundColor: "oklch(0.22 0 0)" }}>
              <p className="text-xs leading-relaxed" style={{ color: "oklch(0.65 0 0)" }}>
                <span className="font-semibold" style={{ color: "oklch(0.80 0 0)" }}>Affiliate Disclosure: </span>
                Some links on this site are Amazon affiliate links. We may earn a small commission at no extra cost to you. This never influences our editorial ratings or recommendations.
              </p>
            </div>
          </div>

          {/* Categories */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "oklch(0.65 0 0)" }}>
              Categories
            </h3>
            <ul className="space-y-2.5">
              {[
                { label: "Electronics", href: "/category/electronics" },
                { label: "Home", href: "/category/home" },
                { label: "Fitness", href: "/category/fitness" },
                { label: "Home Office", href: "/category/home-office" },
              ].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm transition-colors hover:text-white" style={{ color: "oklch(0.70 0 0)" }}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "oklch(0.65 0 0)" }}>
              Company
            </h3>
            <ul className="space-y-2.5">
              {[
                { label: "About Us", href: "/about" },
                { label: "Our Team", href: "/about#team" },
                { label: "How We Test", href: "/about#methodology" },
                { label: "Contact", href: "/contact" },
                { label: "Privacy Policy", href: "/privacy" },
              ].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm transition-colors hover:text-white" style={{ color: "oklch(0.70 0 0)" }}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-8 border-t flex flex-col sm:flex-row items-center justify-between gap-3" style={{ borderColor: "oklch(0.30 0 0)" }}>
          <p className="text-xs" style={{ color: "oklch(0.55 0 0)" }}>
            &copy; {new Date().getFullYear()} TechReview Pro. All rights reserved.
          </p>
          <p className="text-xs" style={{ color: "oklch(0.45 0 0)" }}>
            TechReview Pro is a participant in the Amazon Services LLC Associates Program.
          </p>
        </div>
      </div>
    </footer>
  )
}
