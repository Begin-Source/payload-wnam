import bundledTemplateMdx from '@/content/reviews/offer-review-template.mdx?raw'

/**
 * Template is bundled at build time (`?raw`) so it works on Cloudflare Workers without `fs` / `process.cwd()`.
 */
export function loadOfferReviewTemplate(): string {
  return bundledTemplateMdx
}
