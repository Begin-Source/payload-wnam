export function slugify(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Ensure review slug includes ASIN when present; cap length. */
export function ensureReviewSlugWithAsin(args: {
  title: string
  asin: string
  existingReviewSlug?: string | null
}): string {
  const rawAsin = String(args.asin || '').trim()
  const asin = rawAsin.toLowerCase().replace(/[^a-z0-9]/g, '')
  let slug = String(args.existingReviewSlug || '').trim()
  if (!slug) {
    slug = slugify(args.title || rawAsin || 'review')
  } else {
    slug = slugify(slug)
  }
  if (asin) {
    const asinPattern = new RegExp(`(^|-)${asin}($|-)`, 'i')
    if (!asinPattern.test(slug)) {
      slug = `${slug}-${asin}`
    }
  }
  if (slug.length > 200) {
    slug = slug.slice(0, 200).replace(/-+$/g, '')
  }
  return slug
}
