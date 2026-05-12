import type { Payload } from 'payload'

import { lexicalArticleBodyToPlainText } from '@/services/writing/lexicalBodyPlain'
import { HARD_VETO_CODES, listContainsHardVeto } from '@/utilities/eeatScoring'

export type PublishQueueStatus = 'none' | 'queued' | 'blocked' | 'published'

export type PublishEligibilityResult = {
  eligible: boolean
  reasons: string[]
  qualityScore: number | null
  minQualityScore: number
  affiliateSurface: boolean
  moneyPage: boolean
  disclosurePresent: boolean
  relatedOffersPresent: boolean
  authorPresent: boolean
}

function relationId(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.floor(raw)
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) return Number(raw.trim())
  if (raw && typeof raw === 'object' && 'id' in raw) return relationId((raw as { id?: unknown }).id)
  return null
}

function relationListPresent(raw: unknown): boolean {
  return Array.isArray(raw) && raw.length > 0
}

function hasDisclosure(text: string): boolean {
  return /affiliate|commission|disclosure|we may earn|partner links/i.test(text) ||
    /联盟|推广链接|声明|佣金/i.test(text)
}

function asStringList(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.map((v) => String(v).trim()).filter(Boolean)
    : []
}

export function evaluateArticlePublishEligibility(
  article: Record<string, unknown>,
  opts: { minQualityScore?: number } = {},
): PublishEligibilityResult {
  const minQualityScore = opts.minQualityScore ?? 80
  const qualityScore =
    typeof article.qualityScore === 'number' && Number.isFinite(article.qualityScore)
      ? article.qualityScore
      : null
  const plain = lexicalArticleBodyToPlainText(article.body).trim()
  const disclosurePresent = hasDisclosure(plain)
  const relatedOffersPresent =
    relationListPresent(article.relatedOffers) || relationListPresent(article.featuredOffers)
  const layout = typeof article.affiliatePageLayout === 'string' ? article.affiliatePageLayout : 'default'
  const moneyPage = layout === 'commercial_hub' || layout === 'product_comparison'
  const affiliateSurface =
    moneyPage ||
    relatedOffersPresent ||
    /amazon\.[a-z.]+|amzn\.to|\/dp\/[A-Z0-9]{8,}/i.test(plain)
  const vetoes = asStringList(article.vetoCodes)
  const hardVetoes = vetoes.filter((v) => HARD_VETO_CODES.includes(v as (typeof HARD_VETO_CODES)[number]))
  const authorPresent = relationId(article.author) != null

  const reasons: string[] = []
  if (article.status !== 'draft') reasons.push('article_status_not_draft')
  if (!authorPresent) reasons.push('missing_author')
  if (qualityScore == null) reasons.push('missing_quality_score')
  else if (qualityScore < minQualityScore) reasons.push(`quality_below_${minQualityScore}`)
  if (hardVetoes.length > 0 || listContainsHardVeto(vetoes)) reasons.push('hard_veto_present')
  if (affiliateSurface && !disclosurePresent) reasons.push('missing_affiliate_disclosure')
  if (moneyPage && !relatedOffersPresent) reasons.push('money_page_missing_related_offers')

  return {
    eligible: reasons.length === 0,
    reasons,
    qualityScore,
    minQualityScore,
    affiliateSurface,
    moneyPage,
    disclosurePresent,
    relatedOffersPresent,
    authorPresent,
  }
}

export async function dailyPublishedCountForSite(
  payload: Payload,
  siteId: number,
  now = new Date(),
): Promise<number> {
  const start = new Date(now)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(start.getTime() + 86400000)
  const count = await payload.count({
    collection: 'articles',
    where: {
      and: [
        { site: { equals: siteId } },
        { status: { equals: 'published' } },
        { publishedAt: { greater_than_equal: start.toISOString() } },
        { publishedAt: { less_than: end.toISOString() } },
      ],
    },
    overrideAccess: true,
  })
  return count.totalDocs
}

export async function dailyPostCapForSite(payload: Payload, siteId: number): Promise<number> {
  const res = await payload.find({
    collection: 'site-quotas',
    where: { site: { equals: siteId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const cap = (res.docs[0] as { dailyPostCap?: unknown } | undefined)?.dailyPostCap
  return typeof cap === 'number' && Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : 3
}
