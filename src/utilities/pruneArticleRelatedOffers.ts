/**
 * Pure helpers to filter `articles.relatedOffers` (Featured products AMZ)
 * against the same rules as Articles field filterOptions + existence checks.
 */

export type PruneRelatedOfferDropReason = 'missing' | 'not_active' | 'site_mismatch'

export type MinimalOfferForPrune = {
  id: number
  status: string
  /** Site ids linked on the offer; empty / undefined = not scoped to specific sites. */
  siteIds: number[]
}

export type PruneRelatedOfferDrop = {
  id: number
  reason: PruneRelatedOfferDropReason
}

export type PruneRelatedOfferIdsResult = {
  pruned: number[]
  changed: boolean
  dropped: PruneRelatedOfferDrop[]
}

/**
 * Whether an offer may appear on an article for `articleSiteId`,
 * matching Articles.relatedOffers `filterOptions` plus a resolved offer row.
 */
export function offerEligibleForArticleSite(
  articleSiteId: number | null,
  offer: MinimalOfferForPrune | undefined,
): PruneRelatedOfferDropReason | null {
  if (!offer) return 'missing'
  if (offer.status !== 'active') return 'not_active'

  if (articleSiteId == null) return null

  const scoped = offer.siteIds.length > 0
  if (!scoped) return null
  if (!offer.siteIds.includes(articleSiteId)) return 'site_mismatch'
  return null
}

/** Normalize relationship payloads to ordered numeric ids (dedup, keep order). */
export function normalizeRelatedOfferIdList(
  raw: unknown,
): number[] {
  if (raw == null) return []
  const arr = Array.isArray(raw) ? raw : [raw]
  const out: number[] = []
  const seen = new Set<number>()
  for (const item of arr) {
    const id =
      typeof item === 'number'
        ? item
        : item && typeof item === 'object' && 'id' in item
          ? Number((item as { id: unknown }).id)
          : NaN
    if (!Number.isFinite(id)) continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function articleSiteIdFromDoc(site: unknown): number | null {
  if (site == null) return null
  if (typeof site === 'number' && Number.isFinite(site)) return site
  if (typeof site === 'object' && site !== null && 'id' in site) {
    const id = Number((site as { id: unknown }).id)
    return Number.isFinite(id) ? id : null
  }
  return null
}

/**
 * @param articleSiteId - Resolved article `site` id; pass `finiteSiteId(...)` or null if unknown.
 * @param relatedOfferIds - Current `relatedOffers` ids on the article.
 * @param offersById - Map of offer id -> minimal fields from DB (missing key => offer deleted).
 */
export function pruneRelatedOfferIds(
  articleSiteId: number | null,
  relatedOfferIds: number[],
  offersById: ReadonlyMap<number, MinimalOfferForPrune>,
): PruneRelatedOfferIdsResult {
  const dropped: PruneRelatedOfferDrop[] = []
  const pruned: number[] = []

  for (const id of relatedOfferIds) {
    const offer = offersById.get(id)
    const reason = offerEligibleForArticleSite(articleSiteId, offer)
    if (reason != null) {
      dropped.push({ id, reason })
      continue
    }
    pruned.push(id)
  }

  const changed =
    pruned.length !== relatedOfferIds.length ||
    pruned.some((id, i) => id !== relatedOfferIds[i])

  return { pruned, changed, dropped }
}

/** Convenience: normalize site + ids then prune. */
export function pruneArticleRelatedOffersFromInputs(args: {
  site: unknown
  relatedOffersRaw: unknown
  offersById: ReadonlyMap<number, MinimalOfferForPrune>
}): PruneRelatedOfferIdsResult & { articleSiteId: number | null; normalizedIds: number[] } {
  const articleSiteId = articleSiteIdFromDoc(args.site)
  const normalizedIds = normalizeRelatedOfferIdList(args.relatedOffersRaw)
  const result = pruneRelatedOfferIds(articleSiteId, normalizedIds, args.offersById)
  return { ...result, articleSiteId, normalizedIds }
}
