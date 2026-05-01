import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Config } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { getTenantScopeForStats, tenantIdFromRelation } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

const MAX_TOTAL = 50

function parsePositiveIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  for (const x of raw) {
    const n = typeof x === 'number' ? x : Number(x)
    if (Number.isFinite(n) && n > 0) out.push(Math.floor(n))
  }
  return [...new Set(out)]
}

function clip52(ids: number[], used: number): number[] {
  return ids.slice(0, Math.max(0, MAX_TOTAL - used))
}

function siteIdFromDoc(doc: { site?: number | { id: number } | null }): number | null {
  const s = doc.site
  if (s == null) return null
  return typeof s === 'object' ? s.id : s
}

type PayloadInstance = Awaited<ReturnType<typeof getPayload>>

async function pendingMediaImageJobForMedia(
  payload: PayloadInstance,
  mediaId: number,
): Promise<boolean> {
  const r = await payload.find({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: 'media_image_generate' } },
        { status: { in: ['pending', 'running'] } },
      ],
    },
    limit: 150,
    depth: 0,
    overrideAccess: true,
  })
  for (const doc of r.docs) {
    const inp = doc.input as { mediaId?: unknown } | undefined
    const mid = inp?.mediaId
    const num =
      typeof mid === 'number'
        ? mid
        : typeof mid === 'string' && /^\d+$/.test(mid)
          ? Number(mid)
          : null
    if (num === mediaId) return true
  }
  return false
}

async function pendingMediaImageJobForArticle(
  payload: PayloadInstance,
  articleId: number,
): Promise<boolean> {
  const r = await payload.find({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: 'media_image_generate' } },
        { status: { in: ['pending', 'running'] } },
      ],
    },
    limit: 150,
    depth: 0,
    overrideAccess: true,
  })
  for (const doc of r.docs) {
    const inp = doc.input as { articleId?: unknown } | undefined
    const aid = inp?.articleId
    const num =
      typeof aid === 'number'
        ? aid
        : typeof aid === 'string' && /^\d+$/.test(aid)
          ? Number(aid)
          : null
    if (num === articleId) return true
  }
  return false
}

async function pendingMediaImageJobForPage(
  payload: PayloadInstance,
  pageId: number,
): Promise<boolean> {
  const r = await payload.find({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: 'media_image_generate' } },
        { status: { in: ['pending', 'running'] } },
      ],
    },
    limit: 150,
    depth: 0,
    overrideAccess: true,
  })
  for (const doc of r.docs) {
    const inp = doc.input as { pageId?: unknown } | undefined
    const pid = inp?.pageId
    const num =
      typeof pid === 'number'
        ? pid
        : typeof pid === 'string' && /^\d+$/.test(pid)
          ? Number(pid)
          : null
    if (num === pageId) return true
  }
  return false
}

async function assertSiteAccess(
  payload: PayloadInstance,
  userArg: Config['user'] & { collection: 'users' },
  sid: number,
  scope: ReturnType<typeof getTenantScopeForStats>,
  isSu: boolean,
): Promise<boolean> {
  const siteDoc = await payload.findByID({
    collection: 'sites',
    id: String(sid),
    depth: 0,
    user: userArg,
    overrideAccess: false,
  })
  if (!siteDoc) return false
  const siteTenantId = tenantIdFromRelation((siteDoc as { tenant?: number | { id: number } | null }).tenant)
  return (
    isSu ||
    scope.mode === 'all' ||
    (siteTenantId != null && scope.mode === 'tenants' && scope.tenantIds.includes(siteTenantId))
  )
}

export type QueueSkip = { kind: string; id: number; reason: string }

/** POST — enqueue Together+R2 for media ids and/or articles/pages without (or with) featured image hooks. */
export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    mediaIds?: unknown
    articleIds?: unknown
    pageIds?: unknown
    siteId?: unknown
  }

  let mediaIds = parsePositiveIds(body.mediaIds)
  let articleIds = parsePositiveIds(body.articleIds)
  let pageIds = parsePositiveIds(body.pageIds)

  const totalIn = mediaIds.length + articleIds.length + pageIds.length
  if (totalIn === 0) {
    return Response.json(
      { error: 'Provide at least one of mediaIds, articleIds, pageIds' },
      { status: 400 },
    )
  }

  if (totalIn > MAX_TOTAL) {
    mediaIds = clip52(mediaIds, 0)
    const u1 = mediaIds.length
    articleIds = clip52(articleIds, u1)
    const u2 = u1 + articleIds.length
    pageIds = clip52(pageIds, u2)
  }

  const userArg = user as Config['user'] & { collection: 'users' }
  const scope = getTenantScopeForStats(userArg)
  const isSu = userHasUnscopedAdminAccess(userArg)

  const filterSite =
    typeof body.siteId === 'number' && Number.isFinite(body.siteId)
      ? Number(body.siteId)
      : typeof body.siteId === 'string' && /^\d+$/.test(body.siteId)
        ? Number(body.siteId)
        : null

  const queuedMedia: number[] = []
  const queuedArticles: number[] = []
  const queuedPages: number[] = []
  const skipped: QueueSkip[] = []

  for (const mediaId of mediaIds) {
    try {
      const doc = await payload.findByID({
        collection: 'media',
        id: String(mediaId),
        depth: 1,
        user: userArg,
        overrideAccess: false,
      })
      if (!doc) {
        skipped.push({ kind: 'media', id: mediaId, reason: 'not_found_or_forbidden' })
        continue
      }

      const sid = siteIdFromDoc(doc as { site?: number | { id: number } | null })
      if (sid == null) {
        skipped.push({ kind: 'media', id: mediaId, reason: 'no_site' })
        continue
      }

      if (filterSite != null && sid !== filterSite) {
        skipped.push({ kind: 'media', id: mediaId, reason: 'site_filter_mismatch' })
        continue
      }

      if (!(await assertSiteAccess(payload, userArg, sid, scope, isSu))) {
        skipped.push({ kind: 'media', id: mediaId, reason: 'forbidden_site' })
        continue
      }

      const siteTenantId = tenantIdFromRelation(
        (
          await payload.findByID({
            collection: 'sites',
            id: String(sid),
            depth: 0,
            overrideAccess: true,
          })
        )?.tenant,
      )

      if (await pendingMediaImageJobForMedia(payload, mediaId)) {
        skipped.push({ kind: 'media', id: mediaId, reason: 'already_pending_or_running' })
        continue
      }

      await payload.update({
        collection: 'media',
        id: String(mediaId),
        data: {
          aiImageGenStatus: 'queued',
          aiImageGenError: '',
        },
        overrideAccess: true,
      })

      await payload.create({
        collection: 'workflow-jobs',
        data: {
          label: `Together 配图 · media #${mediaId}`.slice(0, 120),
          jobType: 'media_image_generate',
          status: 'pending',
          site: sid,
          ...(siteTenantId != null ? { tenant: siteTenantId } : {}),
          input: {
            mediaId,
            siteId: sid,
          },
        },
        overrideAccess: true,
      })

      queuedMedia.push(mediaId)
    } catch {
      skipped.push({ kind: 'media', id: mediaId, reason: 'error' })
    }
  }

  async function enqueuePostDoc(
    collection: 'articles' | 'pages',
    docId: number,
    kind: 'article' | 'page',
  ): Promise<void> {
    try {
      const doc = await payload.findByID({
        collection,
        id: String(docId),
        depth: 0,
        user: userArg,
        overrideAccess: false,
      })
      if (!doc) {
        skipped.push({ kind, id: docId, reason: 'not_found_or_forbidden' })
        return
      }

      const sid = siteIdFromDoc(doc as { site?: number | { id: number } | null })
      if (sid == null) {
        skipped.push({ kind, id: docId, reason: 'no_site' })
        return
      }

      if (filterSite != null && sid !== filterSite) {
        skipped.push({ kind, id: docId, reason: 'site_filter_mismatch' })
        return
      }

      if (!(await assertSiteAccess(payload, userArg, sid, scope, isSu))) {
        skipped.push({ kind, id: docId, reason: 'forbidden_site' })
        return
      }

      const siteRow = await payload.findByID({
        collection: 'sites',
        id: String(sid),
        depth: 0,
        overrideAccess: true,
      })
      const siteTenantId = tenantIdFromRelation(
        (siteRow as { tenant?: number | { id: number } | null } | null)?.tenant,
      )

      const pendingFn =
        collection === 'articles' ? pendingMediaImageJobForArticle : pendingMediaImageJobForPage
      if (await pendingFn(payload, docId)) {
        skipped.push({ kind, id: docId, reason: 'already_pending_or_running' })
        return
      }

      const input =
        collection === 'articles'
          ? { articleId: docId, siteId: sid }
          : { pageId: docId, siteId: sid }

      await payload.create({
        collection: 'workflow-jobs',
        data: {
          label:
            (
              collection === 'articles'
                ? `Together 配图 · article #${docId}`
                : `Together 配图 · page #${docId}`
            ).slice(0, 120),
          jobType: 'media_image_generate',
          status: 'pending',
          site: sid,
          ...(siteTenantId != null ? { tenant: siteTenantId } : {}),
          input,
        },
        overrideAccess: true,
      })

      if (collection === 'articles') queuedArticles.push(docId)
      else queuedPages.push(docId)
    } catch {
      skipped.push({ kind, id: docId, reason: 'error' })
    }
  }

  for (const aid of articleIds) {
    await enqueuePostDoc('articles', aid, 'article')
  }
  for (const pid of pageIds) {
    await enqueuePostDoc('pages', pid, 'page')
  }

  const queuedCount = queuedMedia.length + queuedArticles.length + queuedPages.length

  return Response.json({
    ok: true,
    queuedCount,
    queuedMediaIds: queuedMedia,
    queuedArticleIds: queuedArticles,
    queuedPageIds: queuedPages,
    skipped,
    capped: totalIn > MAX_TOTAL,
  })
}
