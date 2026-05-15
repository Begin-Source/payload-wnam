import configPromise from '@payload-config'
import { getPayload } from 'payload'

import {
  previewDraftSkeletonEnqueue,
  tryEnqueueDraftSkeletonJob,
} from '@/app/api/pipeline/lib/enqueueDraftSkeletonAfterBrief'
import { enqueueArticlePipelineCatchup } from '@/app/api/pipeline/lib/articlePipelineChain'
import type { Config } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { tenantIdFromRelation } from '@/utilities/tenantScope'
import { userHasPipelineRunNextAccess } from '@/utilities/userRoles'

export const dynamic = 'force-dynamic'

const MAX_BRIEF_IDS = 50
const DEFAULT_SITE_LIMIT = 25
const MAX_SITE_LIMIT = 50

export type EnqueueDraftSkeletonResultRow = {
  briefId: number
  created: boolean
  jobId?: number
  articleId?: number
  reason?: string
  messages?: string[]
}

export type DraftSkeletonDryRunPreviewRow = {
  briefId: number
  wouldCreate: boolean
  reason?: string
}

function siteIdFromBriefDoc(doc: { site?: number | { id: number } | null }): number | null {
  const s = doc.site
  if (s == null) return null
  if (typeof s === 'number' && Number.isFinite(s)) return s
  if (typeof s === 'object' && 'id' in s) {
    const id = (s as { id: number }).id
    if (typeof id === 'number' && Number.isFinite(id)) return id
  }
  return null
}

function parsePositiveInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.floor(v)
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim())
  return null
}

function clampSiteLimit(raw: unknown): number {
  const n = parsePositiveInt(raw)
  if (n == null || !Number.isFinite(n)) return DEFAULT_SITE_LIMIT
  return Math.min(MAX_SITE_LIMIT, Math.max(1, n))
}

async function countActiveBriefGenerateJobsForSite(
  payload: Awaited<ReturnType<typeof getPayload>>,
  siteId: number,
): Promise<number> {
  const active = await payload.count({
    collection: 'workflow-jobs',
    where: {
      and: [
        { site: { equals: siteId } },
        { jobType: { equals: 'brief_generate' } },
        { status: { in: ['pending', 'running'] } },
      ],
    },
    overrideAccess: true,
  })
  return active.totalDocs
}

async function latestArticleIdForBrief(
  payload: Awaited<ReturnType<typeof getPayload>>,
  user: Config['user'] & { collection: 'users' },
  briefId: number,
): Promise<number | null> {
  const articles = await payload.find({
    collection: 'articles',
    where: { sourceBrief: { equals: briefId } },
    sort: '-createdAt',
    limit: 1,
    depth: 0,
    user,
    overrideAccess: false,
  })
  const first = articles.docs[0] as { id?: unknown } | undefined
  return typeof first?.id === 'number' && Number.isFinite(first.id) ? first.id : null
}

async function enqueueDraftSkeletonOrCatchup(args: {
  payload: Awaited<ReturnType<typeof getPayload>>
  user: Config['user'] & { collection: 'users' }
  briefId: number
  siteNumeric: number | null
  tenantNumeric: number | null
}): Promise<EnqueueDraftSkeletonResultRow> {
  const existingArticleId = await latestArticleIdForBrief(args.payload, args.user, args.briefId)
  if (existingArticleId != null) {
    const catchup = await enqueueArticlePipelineCatchup(args.payload, existingArticleId)
    if (!catchup.ok) {
      return {
        briefId: args.briefId,
        created: false,
        articleId: existingArticleId,
        reason: catchup.error,
      }
    }
    const created = catchup.messages.some((m) => m.includes('入队'))
    return {
      briefId: args.briefId,
      created,
      articleId: existingArticleId,
      ...(catchup.messages.length > 0
        ? { messages: catchup.messages }
        : { reason: 'article_catchup_no_missing_jobs' }),
    }
  }

  const r = await tryEnqueueDraftSkeletonJob(args.payload, {
    briefId: args.briefId,
    siteNumeric: args.siteNumeric,
    tenantNumeric: args.tenantNumeric,
  })
  if (r.created) {
    return { briefId: args.briefId, created: true, jobId: r.id }
  }
  return { briefId: args.briefId, created: false, reason: r.reason }
}

/** POST — enqueue `draft_skeleton` jobs for selected brief ids or for the oldest briefs under a site. */
export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userArg = user as Config['user'] & { collection: 'users' }
  if (!userHasPipelineRunNextAccess(userArg)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    briefIds?: unknown
    siteId?: unknown
    limit?: unknown
    dryRun?: unknown
    allowWhileBriefGenerate?: unknown
  }

  const dryRun = body.dryRun === true

  const hasBriefIds = Array.isArray(body.briefIds)
  const siteIdRaw = body.siteId
  const hasSiteId = siteIdRaw !== undefined && siteIdRaw !== null

  if (hasBriefIds && hasSiteId) {
    return Response.json({ error: 'Specify either briefIds or siteId, not both' }, { status: 400 })
  }
  if (!hasBriefIds && !hasSiteId) {
    return Response.json({ error: 'briefIds or siteId required' }, { status: 400 })
  }
  if (hasBriefIds && dryRun) {
    return Response.json({ error: 'dryRun is only supported with siteId' }, { status: 400 })
  }

  const results: EnqueueDraftSkeletonResultRow[] = []

  if (hasBriefIds) {
    const rawIds = body.briefIds as unknown[]
    if (rawIds.length === 0) {
      return Response.json({ error: 'briefIds must be non-empty' }, { status: 400 })
    }
    if (rawIds.length > MAX_BRIEF_IDS) {
      return Response.json({ error: `briefIds length must be ≤ ${MAX_BRIEF_IDS}` }, { status: 400 })
    }

    for (const raw of rawIds) {
      const id = parsePositiveInt(raw)
      if (id == null) {
        results.push({
          briefId: 0,
          created: false,
          reason: 'invalid_brief_id',
        })
        continue
      }

      let brief: {
        id?: number
        site?: number | { id: number } | null
        tenant?: number | { id: number } | null
      } | null = null
      try {
        brief = (await payload.findByID({
          collection: 'content-briefs',
          id: String(id),
          depth: 0,
          user: userArg,
          overrideAccess: false,
        })) as typeof brief
      } catch {
        brief = null
      }
      if (!brief) {
        results.push({ briefId: id, created: false, reason: 'not_found_or_forbidden' })
        continue
      }

      const siteNumeric = siteIdFromBriefDoc(brief)
      const tenantNumeric = tenantIdFromRelation(brief.tenant)
      try {
        results.push(await enqueueDraftSkeletonOrCatchup({
          payload,
          user: userArg,
          briefId: id,
          siteNumeric,
          tenantNumeric,
        }))
      } catch (e) {
        results.push({
          briefId: id,
          created: false,
          reason: e instanceof Error ? e.message.slice(0, 500) : 'create_failed',
        })
      }
    }

    return Response.json({
      ok: true,
      mode: 'byIds' as const,
      results,
    })
  }

  const siteId = parsePositiveInt(siteIdRaw)
  if (siteId == null) {
    return Response.json({ error: 'siteId must be a positive integer' }, { status: 400 })
  }

  let siteOk = false
  try {
    const siteDoc = await payload.findByID({
      collection: 'sites',
      id: String(siteId),
      depth: 0,
      user: userArg,
      overrideAccess: false,
    })
    siteOk = Boolean(siteDoc)
  } catch {
    siteOk = false
  }
  if (!siteOk) {
    return Response.json({ error: 'Site not found or forbidden' }, { status: 404 })
  }

  if (body.allowWhileBriefGenerate !== true) {
    const activeBriefGenerateJobs = await countActiveBriefGenerateJobsForSite(payload, siteId)
    if (activeBriefGenerateJobs > 0) {
      return Response.json(
        {
          error: `还有 ${activeBriefGenerateJobs} 个 Brief 生成任务未完成，请等大纲生成完成后再生成文章草稿。`,
          activeBriefGenerateJobs,
        },
        { status: 409 },
      )
    }
  }

  const limit = clampSiteLimit(body.limit)

  const found = await payload.find({
    collection: 'content-briefs',
    where: { site: { equals: siteId } },
    sort: 'createdAt',
    limit,
    depth: 0,
    user: userArg,
    overrideAccess: false,
  })

  const docs = found.docs as Array<{
    id?: number
    site?: number | { id: number } | null
    tenant?: number | { id: number } | null
  }>

  if (dryRun) {
    const preview: DraftSkeletonDryRunPreviewRow[] = []
    for (const brief of docs) {
      const bid = typeof brief.id === 'number' && Number.isFinite(brief.id) ? brief.id : Number.NaN
      if (!Number.isFinite(bid)) continue

      const siteOnBrief = siteIdFromBriefDoc(brief)
      if (siteOnBrief == null) {
        preview.push({ briefId: bid, wouldCreate: false, reason: 'missing_site' })
        continue
      }
      if (siteOnBrief !== siteId) {
        preview.push({ briefId: bid, wouldCreate: false, reason: 'site_mismatch' })
        continue
      }

      try {
        const tenantNumeric = tenantIdFromRelation(brief.tenant)
        const r = await previewDraftSkeletonEnqueue(payload, {
          briefId: bid,
          siteNumeric: siteOnBrief,
          tenantNumeric,
        })
        if (r.wouldCreate) {
          preview.push({ briefId: bid, wouldCreate: true })
        } else {
          preview.push({ briefId: bid, wouldCreate: false, reason: r.reason })
        }
      } catch (e) {
        preview.push({
          briefId: bid,
          wouldCreate: false,
          reason: e instanceof Error ? e.message.slice(0, 500) : 'preview_failed',
        })
      }
    }

    return Response.json({
      ok: true,
      dryRun: true as const,
      siteId,
      limit,
      queriedCount: docs.length,
      preview,
    })
  }

  for (const brief of docs) {
    const bid = typeof brief.id === 'number' && Number.isFinite(brief.id) ? brief.id : Number.NaN
    if (!Number.isFinite(bid)) continue

    const siteOnBrief = siteIdFromBriefDoc(brief)
    if (siteOnBrief == null) {
      results.push({ briefId: bid, created: false, reason: 'missing_site' })
      continue
    }
    if (siteOnBrief !== siteId) {
      results.push({ briefId: bid, created: false, reason: 'site_mismatch' })
      continue
    }

    try {
      const tenantNumeric = tenantIdFromRelation(brief.tenant)
      results.push(await enqueueDraftSkeletonOrCatchup({
        payload,
        user: userArg,
        briefId: bid,
        siteNumeric: siteOnBrief,
        tenantNumeric,
      }))
    } catch (e) {
      results.push({
        briefId: bid,
        created: false,
        reason: e instanceof Error ? e.message.slice(0, 500) : 'create_failed',
      })
    }
  }

  return Response.json({
    ok: true,
    mode: 'bySite' as const,
    siteId,
    queriedCount: docs.length,
    results,
  })
}
