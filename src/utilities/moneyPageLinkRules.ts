/** Patch M — money pages (affiliate templates) need enough body inlinks after the probation window. */
export const MONEY_PAGE_CONTENT_TEMPLATES = ['review', 'comparison', 'buyingGuide'] as const

export type MoneyPageTemplate = (typeof MONEY_PAGE_CONTENT_TEMPLATES)[number]

export function isMoneyPageTemplate(value: string | null | undefined): value is MoneyPageTemplate {
  return Boolean(value && (MONEY_PAGE_CONTENT_TEMPLATES as readonly string[]).includes(value))
}

/**
 * @param bodyInlinkCount — inbound edges in `page-link-graph` with `location=body` and fresh `lastSeenAt`.
 */
export function needsMoneyPageReinforce(input: {
  contentTemplate: string | null | undefined
  publishedAt: string | null | undefined
  lifecycleStage: string | null | undefined
  bodyInlinkCount: number
  now?: Date
}): boolean {
  if (!isMoneyPageTemplate(input.contentTemplate)) return false
  const stage = input.lifecycleStage ?? ''
  if (!['probation', 'winner', 'borderline'].includes(stage)) return false
  if (!input.publishedAt) return false
  const now = input.now ?? new Date()
  const pub = new Date(input.publishedAt)
  if (Number.isNaN(pub.getTime())) return false
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - 14)
  if (pub > cutoff) return false
  return input.bodyInlinkCount < 5
}
