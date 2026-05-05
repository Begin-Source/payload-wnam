import type { Category, Media } from '@/payload-types'

import { buildCategoryCoverTogetherPromptText } from '@/utilities/togetherTenantPrompts/togetherImagePromptTemplates'

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
  return buildCategoryCoverTogetherPromptText({
    categoryName: parts.categoryName,
    slug: parts.slug,
    description: parts.description,
    siteName: parts.siteName,
  })
}
