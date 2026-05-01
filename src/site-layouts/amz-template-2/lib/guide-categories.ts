export interface GuideCategoryItem {
  slug: string
  name: string
}

export function slugifyGuideCategory(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function normalizeGuideCategories(input: unknown): GuideCategoryItem[] {
  if (!Array.isArray(input)) return []

  const out: GuideCategoryItem[] = []
  const seen = new Set<string>()

  for (const item of input) {
    const isObject = item !== null && typeof item === 'object'
    const rawName = isObject ? (item as { name?: unknown }).name : item
    const rawSlug = isObject ? (item as { slug?: unknown }).slug : undefined

    const name = String(rawName ?? '').trim()
    if (!name) continue

    const slug = slugifyGuideCategory(rawSlug || name)
    if (!slug || seen.has(slug)) continue

    seen.add(slug)
    out.push({ slug, name })
  }

  return out
}
