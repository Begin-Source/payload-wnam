import type { Article, Category } from '@/payload-types'

/** First populated category for nav / card chips (depth ≥ 1 on article). */
export function firstCategoryFromArticle(article: Article): Category | null {
  const cats = article.categories
  if (!cats?.length) return null
  const first = cats[0]
  if (typeof first === 'object' && first !== null && 'slug' in first) {
    return first as Category
  }
  return null
}

export function categoryIdsFromArticle(article: Article): number[] {
  const cats = article.categories
  if (!cats?.length) return []
  return cats.map((c) => (typeof c === 'number' ? c : c.id))
}
