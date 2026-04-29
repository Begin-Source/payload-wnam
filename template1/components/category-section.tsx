import Link from "next/link"
import { ChevronRight } from "lucide-react"

const categories = [
  {
    name: "电子产品",
    slug: "electronics",
    emoji: "🎧",
    description: "耳机、手机、平板、电脑等数码产品深度评测",
    articleCount: 156
  },
  {
    name: "家居生活",
    slug: "home",
    emoji: "🏠",
    description: "厨房电器、清洁工具、智能家居产品测评",
    articleCount: 98
  },
  {
    name: "运动健身",
    slug: "fitness",
    emoji: "🏃",
    description: "健身器材、运动装备、户外用品专业评测",
    articleCount: 67
  },
  {
    name: "美妆个护",
    slug: "beauty",
    emoji: "✨",
    description: "护肤品、彩妆、个人护理产品使用心得",
    articleCount: 89
  }
]

export function CategorySection() {
  return (
    <section className="py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="font-serif text-2xl md:text-3xl font-bold text-foreground mb-8">
          探索分类
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={`/category/${category.slug}`}
              className="group p-6 bg-card rounded-xl border border-border hover:border-primary/50 hover:shadow-md transition-all"
            >
              <div className="text-4xl mb-4">{category.emoji}</div>
              <h3 className="font-semibold text-foreground mb-2 flex items-center gap-1 group-hover:text-primary transition-colors">
                {category.name}
                <ChevronRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </h3>
              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                {category.description}
              </p>
              <p className="text-xs text-muted-foreground">
                {category.articleCount} 篇评测
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
