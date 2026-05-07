import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Config, Category } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { runCategoryCoverGenerate } from '@/utilities/categoryCover/runCategoryCoverGenerate'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { getTenantScopeForStats, tenantIdFromRelation } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

/** Admin sync run: avoid long requests (Together per category). */
const MAX_SYNC = 10

function parsePositiveIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  for (const x of raw) {
    const n = typeof x === 'number' ? x : Number(x)
    if (Number.isFinite(n) && n > 0) out.push(Math.floor(n))
  }
  return [...new Set(out)]
}

function siteIdFromDoc(doc: { site?: number | { id: number } | null }): number | null {
  const s = doc.site
  if (s == null) return null
  return typeof s === 'object' ? s.id : s
}

type PayloadInstance = Awaited<ReturnType<typeof getPayload>>

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

type RowResult = {
  categoryId: number
  ok: boolean
  name?: string
  slug?: string
  error?: string
  message?: string
  mediaId?: number
  mode?: string
}

function categoryLabels(cat: Category): Pick<RowResult, 'name' | 'slug'> {
  const name = typeof cat.name === 'string' && cat.name.trim() ? cat.name.trim() : undefined
  const slug = typeof cat.slug === 'string' && cat.slug.trim() ? cat.slug.trim() : undefined
  return { name, slug }
}

/**
 * POST — run Together category cover inline (no workflow-jobs). Updates `categoryCoverWorkflowStatus`
 * per row: running → done | error.
 */
export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    siteId?: unknown
    categoryIds?: unknown
    prompt?: unknown
  }

  const siteIdRaw = body.siteId
  const sid =
    typeof siteIdRaw === 'number' && Number.isFinite(siteIdRaw)
      ? Math.floor(siteIdRaw)
      : typeof siteIdRaw === 'string' && /^\d+$/.test(siteIdRaw.trim())
        ? Number(siteIdRaw.trim())
        : NaN
  if (!Number.isFinite(sid)) {
    return Response.json({ error: 'siteId required' }, { status: 400 })
  }

  const categoryIds = parsePositiveIds(body.categoryIds)
  if (categoryIds.length === 0) {
    return Response.json({ error: 'categoryIds required (non-empty array)' }, { status: 400 })
  }
  if (categoryIds.length > MAX_SYNC) {
    return Response.json(
      {
        error: `Too many categories (max ${MAX_SYNC} per request). Narrow selection or split batches.`,
      },
      { status: 400 },
    )
  }

  const promptOpt =
    typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt.trim().slice(0, 8000) : undefined

  const userArg = user as Config['user'] & { collection: 'users' }
  const scope = getTenantScopeForStats(userArg)
  const isSu = userHasUnscopedAdminAccess(userArg)

  if (!(await assertSiteAccess(payload, userArg, sid, scope, isSu))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const results: RowResult[] = []

  for (const categoryId of categoryIds) {
    const cat = await payload.findByID({
      collection: 'categories',
      id: String(categoryId),
      depth: 0,
      user: userArg,
      overrideAccess: false,
    })
    if (!cat) {
      results.push({
        categoryId,
        ok: false,
        error: 'not_found_or_forbidden',
      })
      continue
    }

    const catSite = siteIdFromDoc(cat as { site?: number | { id: number } | null })
    if (catSite == null || catSite !== sid) {
      results.push({
        categoryId,
        ok: false,
        error: 'site_mismatch',
        ...categoryLabels(cat as Category),
      })
      continue
    }

    const catTyped = cat as Category
    const labels = categoryLabels(catTyped)
    const rowStatus = (catTyped.categoryCoverWorkflowStatus ?? 'idle').trim()

    if (rowStatus === 'running') {
      results.push({
        categoryId,
        ok: false,
        error: 'already_running',
        message: '该分类已为「运行中」，请稍后刷新。',
        ...labels,
      })
      continue
    }

    await payload.update({
      collection: 'categories',
      id: String(categoryId),
      data: { categoryCoverWorkflowStatus: 'running' },
      overrideAccess: true,
    })

    const gen = await runCategoryCoverGenerate(payload, categoryId, {
      expectedSiteId: sid,
      prompt: promptOpt ?? null,
    })

    if (gen.ok) {
      await payload.update({
        collection: 'categories',
        id: String(categoryId),
        data: { categoryCoverWorkflowStatus: 'done' },
        overrideAccess: true,
      })
      results.push({
        categoryId,
        ok: true,
        mediaId: gen.mediaId,
        mode: gen.mode,
        ...labels,
      })
    } else {
      await payload.update({
        collection: 'categories',
        id: String(categoryId),
        data: { categoryCoverWorkflowStatus: 'error' },
        overrideAccess: true,
      })
      results.push({
        categoryId,
        ok: false,
        error: gen.error,
        message: gen.message ?? gen.detail,
        ...labels,
      })
    }
  }

  const okCount = results.filter((r) => r.ok).length
  const failCount = results.length - okCount

  return Response.json({
    ok: true,
    results,
    okCount,
    failCount,
  })
}
