import type { Payload, PayloadRequest, Where } from 'payload'

import { tenantIdFromTeamData, userIdFromRelation } from '@/utilities/teamsUserScope'

/** No row should match (deterministic empty set for SQLite). */
export const TEAM_STATS_MATCH_NOTHING: Where = { id: { equals: 0 } }

/**
 * Team performance scope (Admin stats):
 *
 * - **Roster for this document only**: `lead` + `members` on **this** `teams` row (do not union other
 *   teams led by the same user). That keeps team A vs team B distinct.
 * - **Sites**: Same OR shape as team-lead visibility (see `buildSitesVisibilityWhere` in `siteVisibilityScope.ts`):
 *   - `sites.createdBy` in roster user ids, **or**
 *   - `sites.operators` contains the **lead** (not each member).
 * - **Tenant**: When the team has `tenant`, restrict `sites` (and thus article rollups) to that tenant.
 * - **Articles**: Count only rows whose `site` is in the resolved site-id list for this team.
 */
export type TeamDocLike = {
  tenant?: unknown
  lead?: unknown
  members?: unknown
}

export type TeamRoster = {
  tenantId: number | null
  leadId: number | null
  memberIds: number[]
  /** Unique user ids: lead (if set) + members. */
  creatorIds: number[]
}

export function rosterFromTeamDoc(doc: TeamDocLike): TeamRoster {
  const tenantId = tenantIdFromTeamData(doc as Record<string, unknown>)
  const leadId = userIdFromRelation(doc.lead)
  const memberIds: number[] = []
  if (Array.isArray(doc.members)) {
    for (const m of doc.members) {
      const id = userIdFromRelation(m)
      if (id != null) memberIds.push(id)
    }
  }
  const creatorIds = new Set<number>()
  if (leadId != null) creatorIds.add(leadId)
  for (const id of memberIds) creatorIds.add(id)
  return { tenantId, leadId, memberIds, creatorIds: [...creatorIds] }
}

export type BuildTeamSitesWhereResult =
  | { ok: true; where: Where }
  | { ok: false; reason: 'no_lead'; where: Where }

/**
 * @param leadUserId — Required for site OR; without a lead the team cannot be scoped (returns `no_lead`).
 */
export function buildTeamSitesWhere(roster: TeamRoster): BuildTeamSitesWhereResult {
  if (roster.leadId == null) {
    return { ok: false, reason: 'no_lead', where: TEAM_STATS_MATCH_NOTHING }
  }

  const leadUserId = roster.leadId
  const clauses: Where[] = []
  if (roster.creatorIds.length > 0) {
    clauses.push({ createdBy: { in: roster.creatorIds } })
  }
  clauses.push({ operators: { contains: leadUserId } })

  const siteOr: Where =
    clauses.length === 1 ? (clauses[0] as Where) : { or: clauses }

  if (roster.tenantId != null) {
    return {
      ok: true,
      where: {
        and: [{ tenant: { equals: roster.tenantId } }, siteOr],
      },
    }
  }

  return { ok: true, where: siteOr }
}

/** Page through `sites` matching `where` (override access — internal stats). */
export async function resolveTeamSiteIds(
  payload: Payload,
  req: Partial<PayloadRequest> | undefined,
  where: Where,
): Promise<number[]> {
  const ids: number[] = []
  let page = 1
  for (;;) {
    const res = await payload.find({
      collection: 'sites',
      where,
      depth: 0,
      limit: 200,
      page,
      pagination: true,
      req,
      overrideAccess: true,
    })
    ids.push(...res.docs.map((d: { id: number }) => d.id))
    if (!res.hasNextPage) break
    page++
  }
  return ids
}

/** SQLite-friendly batch size for `in` queries. */
const SITE_ID_CHUNK = 64

export async function countArticlesForSites(
  payload: Payload,
  req: Partial<PayloadRequest> | undefined,
  siteIds: number[],
  extraWhere?: Where,
): Promise<number> {
  if (siteIds.length === 0) return 0
  let total = 0
  for (let i = 0; i < siteIds.length; i += SITE_ID_CHUNK) {
    const chunk = siteIds.slice(i, i + SITE_ID_CHUNK)
    const clauses: Where[] = [{ site: { in: chunk } }]
    if (extraWhere != null && Object.keys(extraWhere).length > 0) {
      clauses.push(extraWhere)
    }
    const where: Where = clauses.length === 1 ? clauses[0]! : { and: clauses }
    const result = await payload.count({
      collection: 'articles',
      where,
      req,
      overrideAccess: true,
    })
    total += result.totalDocs
  }
  return total
}

export function isoDaysAgoUtc(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

/** Same metrics as `TeamAdminStatsJson` success branch (without `ok`). */
export type TeamStatsMetrics = {
  rosterCount: number
  leadAssigned: boolean
  message?: string
  sitesTotal: number
  articlesTotal: number
  articlesPublished: number
  articlesDraft: number
  articlesPublishedLast30d: number
}

/**
 * Aggregate sites + articles for one team document (Admin; uses overrideAccess for counts).
 */
export async function computeTeamStats(
  payload: Payload,
  req: Partial<PayloadRequest> | undefined,
  team: TeamDocLike,
): Promise<TeamStatsMetrics> {
  const roster = rosterFromTeamDoc(team)
  const built = buildTeamSitesWhere(roster)

  if (!built.ok) {
    return {
      rosterCount: roster.creatorIds.length,
      leadAssigned: false,
      message: '未设置组长，无法统计关联站点与文章。',
      sitesTotal: 0,
      articlesTotal: 0,
      articlesPublished: 0,
      articlesDraft: 0,
      articlesPublishedLast30d: 0,
    }
  }

  const sitesTotal = (
    await payload.count({
      collection: 'sites',
      where: built.where,
      overrideAccess: true,
      req,
    })
  ).totalDocs

  const siteIds = await resolveTeamSiteIds(payload, req, built.where)
  const since30 = isoDaysAgoUtc(30)

  const [articlesTotal, articlesPublished, articlesDraft, articlesPublishedLast30d] =
    await Promise.all([
      countArticlesForSites(payload, req, siteIds),
      countArticlesForSites(payload, req, siteIds, {
        status: { equals: 'published' as const },
      }),
      countArticlesForSites(payload, req, siteIds, {
        status: { equals: 'draft' as const },
      }),
      countArticlesForSites(payload, req, siteIds, {
        and: [
          { status: { equals: 'published' as const } },
          { publishedAt: { greater_than_equal: since30 } },
        ],
      }),
    ])

  const metrics: TeamStatsMetrics = {
    rosterCount: roster.creatorIds.length,
    leadAssigned: true,
    sitesTotal,
    articlesTotal,
    articlesPublished,
    articlesDraft,
    articlesPublishedLast30d,
  }

  if (sitesTotal === 0 && roster.leadId != null) {
    metrics.message = '当前口径下暂无关联站点（创建人或组长运营关系匹配的站点）。'
  }

  return metrics
}

/** `GET /api/admin/teams/stats-summary` success body. */
export type TeamStatsSummaryRow = {
  id: number
  name: string
  tenantId: number | null
  stats: TeamStatsMetrics
}

export type TeamStatsSummaryJson =
  | {
      ok: true
      rows: TeamStatsSummaryRow[]
      totalDocs: number
      page: number
      totalPages: number
      hasNextPage: boolean
      hasPrevPage: boolean
      limit: number
    }
  | { ok: false; error: string }

/** JSON body for `GET /api/admin/teams/:id/stats`. */
export type TeamAdminStatsJson =
  | {
      ok: true
      rosterCount: number
      leadAssigned: boolean
      message?: string
      sitesTotal: number
      articlesTotal: number
      articlesPublished: number
      articlesDraft: number
      articlesPublishedLast30d: number
    }
  | { ok: false; error: string }
