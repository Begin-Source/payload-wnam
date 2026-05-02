import type { Category, Media } from '@/payload-types'

/** Public CDN URL from category.coverImage after depth-1 populate. */
export function publicUrlFromCategoryCover(
  c: Pick<Category, 'coverImage'>,
): string | undefined {
  const m = c.coverImage
  if (m != null && typeof m === 'object' && 'url' in m) {
    const u = (m as Media).url
    if (typeof u === 'string' && u.trim()) return u.trim()
  }
  return undefined
}

export function makeCategoryCoverImagePrompt(parts: {
  categoryName: string
  slug: string
  description: string | null
  siteName?: string | null
  override?: string | null
}): string {
  const o = parts.override?.trim()
  if (o) return o
  const name = parts.categoryName.trim() || parts.slug.trim() || 'Product category'
  const slugLine = parts.slug.trim() ? `slug: ${parts.slug.trim()}` : ''
  const desc = (parts.description ?? '').trim().slice(0, 500)
  const site = parts.siteName?.trim()
  const siteLine = site ? `Store context: ${site}.` : ''
  const descLine = desc ? `Category hint: ${desc}` : ''

  return [
    'Ultra-clean ecommerce category tile, square composition, centered single hero object or minimal flat-lay.',
    `Subject: "${name}". ${slugLine}`,
    descLine,
    siteLine,
    'Style: realistic product photography lighting, subtle shadow, muted premium background gradient, high-end editorial feel.',
    'No text overlays, watermarks, or logos.',
  ]
    .filter((x) => x.length > 0)
    .join(' ')
}
