import fsync from 'fs'
import path from 'path'

/**
 * Default template bundled with the app; override with OFFER_REVIEW_MDX_TEMPLATE_PATH.
 */
export function loadOfferReviewTemplate(): string {
  const envPath = process.env.OFFER_REVIEW_MDX_TEMPLATE_PATH?.trim()
  if (envPath && fsync.existsSync(envPath)) {
    return fsync.readFileSync(envPath, 'utf8')
  }
  const rel = path.join(process.cwd(), 'src/content/reviews/offer-review-template.mdx')
  return fsync.readFileSync(rel, 'utf8')
}
