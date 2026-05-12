import type { Payload } from 'payload'

import {
  dailyPostCapForSite,
  dailyPublishedCountForSite,
  evaluateArticlePublishEligibility,
} from '@/utilities/articlePublishScheduling'

export type RunScheduledPublishOptions = {
  siteId?: number | null
  limit?: number
  minQualityScore?: number
  now?: Date
}

export type RunScheduledPublishResult = {
  ok: true
  scanned: number
  published: number
  blocked: number
  skipped: number
  results: Array<{
    id: number | string
    title?: string
    status: 'published' | 'blocked' | 'skipped'
    reason?: string
  }>
}

function relationId(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.floor(raw)
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) return Number(raw.trim())
  if (raw && typeof raw === 'object' && 'id' in raw) return relationId((raw as { id?: unknown }).id)
  return null
}

export async function runScheduledPublish(
  payload: Payload,
  opts: RunScheduledPublishOptions = {},
): Promise<RunScheduledPublishResult> {
  const now = opts.now ?? new Date()
  const limit = opts.limit ?? 20
  const minQualityScore = opts.minQualityScore ?? 80
  const siteFilter = opts.siteId ?? null

  const articles = await payload.find({
    collection: 'articles',
    where: {
      and: [
        { status: { equals: 'draft' } },
        { publishQueueStatus: { equals: 'queued' } },
        { publishEligible: { equals: true } },
        { scheduledPublishAt: { less_than_equal: now.toISOString() } },
        ...(siteFilter != null ? [{ site: { equals: siteFilter } }] : []),
      ],
    },
    limit: 100,
    depth: 0,
    sort: 'scheduledPublishAt',
    overrideAccess: true,
  })

  const publishedBySite = new Map<number, number>()
  const capBySite = new Map<number, number>()
  const results: RunScheduledPublishResult['results'] = []
  let published = 0
  let blocked = 0
  let skipped = 0

  for (const article of articles.docs as unknown as Array<Record<string, unknown> & { id: number | string; title?: string }>) {
    if (published >= limit) break
    const siteId = relationId(article.site)
    if (siteId == null) {
      skipped += 1
      results.push({ id: article.id, title: article.title, status: 'skipped', reason: 'missing_site' })
      continue
    }

    if (!capBySite.has(siteId)) {
      capBySite.set(siteId, await dailyPostCapForSite(payload, siteId))
      publishedBySite.set(siteId, await dailyPublishedCountForSite(payload, siteId, now))
    }
    const cap = capBySite.get(siteId) ?? 3
    const used = publishedBySite.get(siteId) ?? 0
    if (used >= cap) {
      skipped += 1
      results.push({ id: article.id, title: article.title, status: 'skipped', reason: 'daily_cap_reached' })
      continue
    }

    const check = evaluateArticlePublishEligibility(article, { minQualityScore })
    if (!check.eligible) {
      blocked += 1
      const reason = check.reasons.join(', ')
      await payload.update({
        collection: 'articles',
        id: article.id,
        data: {
          publishQueueStatus: 'blocked',
          publishEligible: false,
          publishBlockedReason: reason,
        },
        overrideAccess: true,
      })
      results.push({ id: article.id, title: article.title, status: 'blocked', reason })
      continue
    }

    try {
      const publishData: Record<string, unknown> = {
        status: 'published',
        publishedAt: now.toISOString(),
        publishQueueStatus: 'published',
        publishEligible: true,
        publishBlockedReason: '',
        _quality: {
          rawScore: check.qualityScore ?? minQualityScore,
          vetoes: Array.isArray(article.vetoCodes) ? article.vetoCodes : [],
        },
      }
      await payload.update({
        collection: 'articles',
        id: article.id,
        data: publishData,
        overrideAccess: true,
      })
      published += 1
      publishedBySite.set(siteId, used + 1)
      results.push({ id: article.id, title: article.title, status: 'published' })
    } catch (e) {
      blocked += 1
      const reason = e instanceof Error ? e.message : 'publish_update_failed'
      await payload.update({
        collection: 'articles',
        id: article.id,
        data: {
          publishQueueStatus: 'blocked',
          publishEligible: false,
          publishBlockedReason: reason,
        },
        overrideAccess: true,
      })
      results.push({ id: article.id, title: article.title, status: 'blocked', reason })
    }
  }

  return {
    ok: true,
    scanned: articles.docs.length,
    published,
    blocked,
    skipped,
    results: results.slice(0, 25),
  }
}
