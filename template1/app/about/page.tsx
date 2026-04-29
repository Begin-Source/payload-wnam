import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { authors } from "@/lib/data"
import { ShieldCheck, FlaskConical, Award, Users, ChevronRight, CheckCircle } from "lucide-react"

export const metadata: Metadata = {
  title: "About Us",
  description:
    "TechReview Pro is an independent product review publication. Learn about our team, our testing methodology, and our editorial standards.",
}

const testingSteps = [
  {
    number: "01",
    title: "We Buy the Products",
    body: "Every product is purchased at retail price or borrowed through standard loan programs — never gifted in exchange for coverage. Our opinions are never shaped by manufacturer relationships.",
  },
  {
    number: "02",
    title: "Real-World Testing",
    body: "We test products in the conditions you actually use them. We wear headphones on subway commutes, deploy robot vacuums in homes with pets, and run standing desks under full workstation loads for weeks.",
  },
  {
    number: "03",
    title: "Strict Minimum Testing Periods",
    body: "At least 2 weeks for consumer electronics, 4 weeks for home appliances, 8 weeks for fitness equipment. No review goes live until the testing period is complete.",
  },
  {
    number: "04",
    title: "Weighted Scoring Rubrics",
    body: "Scores use a category-specific weighted rubric established before testing begins. Writers cannot adjust criteria retroactively. Scores and copy are reviewed separately by our editor.",
  },
  {
    number: "05",
    title: "Ongoing Updates",
    body: "We revisit reviews when new firmware, new competitors, or price changes make an update warranted. Every review shows both a published date and a last-updated date.",
  },
]

const values = [
  {
    icon: ShieldCheck,
    title: "Editorial Independence",
    body: "We never accept payment for positive coverage. Affiliate relationships are disclosed prominently, and our reviewers are kept completely separate from commercial decisions.",
  },
  {
    icon: FlaskConical,
    title: "Hands-On Testing",
    body: "We don't write reviews based on spec sheets or press releases. Every recommendation is backed by documented, real-world testing with minimum time periods.",
  },
  {
    icon: Award,
    title: "Subject-Matter Expertise",
    body: "Our reviewers are specialists, not generalists. Each writer covers only the product categories where they have deep, verifiable experience.",
  },
  {
    icon: Users,
    title: "Reader-First",
    body: "Our only goal is to help you make a better buying decision. We have no incentive to recommend products that don't deserve it.",
  },
]

const commitments = [
  { label: "Zero paid placements", desc: "We never accept payment to recommend a product" },
  { label: "Retail-purchased products", desc: "Bought with our own money, at market price" },
  { label: "Disclosed affiliate links", desc: "Every affiliate link is clearly labeled" },
  { label: "Expert-written reviews", desc: "Each review written by a category specialist" },
  { label: "Regularly updated", desc: "Reviews stay current with the market" },
  { label: "No brand access required", desc: "We review what's available to any consumer" },
]

export default function AboutPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "TechReview Pro",
    description: "Independent product reviews written by experienced experts.",
    url: "https://techreviewpro.com",
    foundingDate: "2016",
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-10">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">About Us</span>
        </nav>

        {/* Hero */}
        <div className="mb-14">
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-foreground text-balance mb-5 leading-tight">
            About TechReview Pro
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed max-w-3xl">
            TechReview Pro is an independent product review publication founded on a simple frustration: most review sites are too cozy with the brands they cover. We built something different — a publication where editorial integrity is non-negotiable and every recommendation is earned through rigorous, transparent testing.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
          {[
            { value: "400+", label: "Products Tested" },
            { value: "11 yrs", label: "Avg. Expert Experience" },
            { value: "50 hrs", label: "Avg. Per Review" },
            { value: "0", label: "Paid Placements" },
          ].map(({ value, label }) => (
            <div key={label} className="text-center p-5 bg-muted/60 rounded-xl border border-border">
              <p className="font-serif font-bold text-3xl text-primary mb-1">{value}</p>
              <p className="text-xs text-muted-foreground leading-tight">{label}</p>
            </div>
          ))}
        </div>

        {/* Values */}
        <section className="mb-16" id="values">
          <h2 className="font-serif text-2xl font-bold text-foreground mb-7">What We Stand For</h2>
          <div className="grid sm:grid-cols-2 gap-5">
            {values.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4 p-5 border border-border rounded-xl">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1.5">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Team */}
        <section className="mb-16" id="team">
          <h2 className="font-serif text-2xl font-bold text-foreground mb-2">Meet Our Reviewers</h2>
          <p className="text-muted-foreground text-sm mb-7">
            Our writers are specialists with verified, real-world experience in their categories.
          </p>
          <div className="grid md:grid-cols-2 gap-5">
            {authors.map((author) => (
              <Link
                key={author.id}
                href={`/author/${author.id}`}
                className="group flex gap-5 p-6 border border-border rounded-xl hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="relative w-20 h-20 rounded-full overflow-hidden bg-muted flex-shrink-0 border-2 border-border group-hover:border-primary transition-colors">
                  <Image src={author.avatar} alt={author.name} fill className="object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-serif font-bold text-lg text-foreground group-hover:text-primary transition-colors mb-0.5">
                    {author.name}
                  </h3>
                  <p className="text-sm text-primary font-medium mb-1">{author.title}</p>
                  <p className="text-xs text-muted-foreground mb-3">{author.experience}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{author.bio}</p>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {author.expertise.slice(0, 3).map((e) => (
                      <span key={e} className="text-xs px-2 py-0.5 bg-muted rounded text-muted-foreground border border-border">
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Methodology */}
        <section className="mb-16" id="methodology">
          <h2 className="font-serif text-2xl font-bold text-foreground mb-2">How We Test</h2>
          <p className="text-muted-foreground text-sm mb-7">
            Our process is designed to be thorough, reproducible, and immune to outside influence.
          </p>
          <div className="space-y-4">
            {testingSteps.map((step) => (
              <div key={step.number} className="flex gap-5 p-5 border border-border rounded-xl">
                <span className="font-serif font-bold text-2xl text-primary/25 flex-shrink-0 leading-none mt-0.5">
                  {step.number}
                </span>
                <div>
                  <h3 className="font-semibold text-foreground mb-1.5">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Commitments */}
        <section className="mb-16">
          <h2 className="font-serif text-2xl font-bold text-foreground mb-7">Our Commitments</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {commitments.map(({ label, desc }) => (
              <div key={label} className="flex items-start gap-3 p-4 bg-muted/40 rounded-xl border border-border">
                <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Affiliate Disclosure */}
        <div className="p-6 bg-muted/50 rounded-xl border border-border">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-foreground mb-2">Affiliate Disclosure</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                TechReview Pro participates in the Amazon Associates Program. Some links on this site earn us a small commission if you purchase through them, at no additional cost to you. Affiliate revenue funds our testing and keeps reviews free to read. Our editorial team operates independently from our commercial team — affiliate arrangements have no bearing on our ratings or recommendations.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
