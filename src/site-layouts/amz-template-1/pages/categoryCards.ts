import type { AmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import type { Category } from '@/payload-types'

export type AmzCategoryCard = {
  slug: string
  title: string
  description: string
  icon: string
  coverImage?: string
}

/**
 * CMS `categories` first; `homepage.categories.items` merges by slug as **overrides**
 * (icon / coverImage / description). If CMS is empty, fallback to JSON-only items.
 */
export function buildAmzCategoryCards(config: AmzSiteConfig, categories: Category[]): AmzCategoryCard[] {
  const items = config.homepage.categories.items ?? []
  const overridesBySlug = new Map(
    items.filter((i) => i.slug?.trim()).map((i) => [String(i.slug).trim(), i] as const),
  )

  if (categories.length > 0) {
    return categories.map((c) => {
      const slug = (c.slug ?? String(c.id)).trim()
      const o = overridesBySlug.get(slug)
      const cmsDesc = (c.description ?? '').trim()
      return {
        slug,
        title: c.name,
        description: o?.description != null && String(o.description).trim() !== '' ? String(o.description).trim() : cmsDesc,
        icon: (o?.icon && String(o.icon).trim()) || 'Image',
        coverImage: o?.coverImage,
      }
    })
  }

  if (items.length > 0) {
    return items.map((item) => ({
      slug: item.slug,
      title: item.name,
      description: (item.description ?? '').trim(),
      icon: item.icon || 'Image',
      coverImage: item.coverImage,
    }))
  }

  return []
}
