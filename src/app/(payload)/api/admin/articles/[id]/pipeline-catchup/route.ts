import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { enqueueArticlePipelineCatchup } from '@/app/api/pipeline/lib/articlePipelineChain'
import type { Config } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { getTenantScopeForStats, tenantIdFromRelation } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

function siteIdFromDoc(doc: {
  site?: number | { id: number } | null
}): number | null {
  const s = doc.site
  if (s == null) return null
  return typeof s === 'object' ? s.id : s
}

/** POST — enqueue missing draft_section / draft_finalize / image_generate for an article (sourceBrief required). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: idParam } = await context.params
  const articleIdNum = Number(idParam)
  if (!Number.isFinite(articleIdNum)) {
    return Response.json({ error: 'invalid article id' }, { status: 400 })
  }

  const userArg = user as Config['user'] & { collection: 'users' }
  const scope = getTenantScopeForStats(userArg)

  try {
    const article = await payload.findByID({
      collection: 'articles',
      id: String(articleIdNum),
      depth: 1,
      user: userArg,
      overrideAccess: false,
    })
    if (!article) {
      return Response.json({ error: 'Article not found' }, { status: 404 })
    }

    const tenantId = tenantIdFromRelation((article as { tenant?: number | { id: number } | null }).tenant)
    let siteTenant: number | null = null
    const sid = siteIdFromDoc(article as { site?: number | { id: number } | null })
    if (sid != null) {
      const siteDoc = await payload.findByID({
        collection: 'sites',
        id: String(sid),
        depth: 0,
        user: userArg,
        overrideAccess: false,
      })
      siteTenant = tenantIdFromRelation(
        (siteDoc as { tenant?: number | { id: number } | null } | null)?.tenant,
      )
    }

    const allowed =
      userHasUnscopedAdminAccess(userArg) ||
      scope.mode === 'all' ||
      (tenantId != null && scope.mode === 'tenants' && scope.tenantIds.includes(tenantId)) ||
      (siteTenant != null && scope.mode === 'tenants' && scope.tenantIds.includes(siteTenant))

    if (!allowed) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
  } catch {
    return Response.json({ error: 'Article not found' }, { status: 404 })
  }

  const body = await enqueueArticlePipelineCatchup(payload, articleIdNum)
  if (!body.ok) {
    return Response.json({ error: body.error }, { status: 400 })
  }
  return Response.json({ ok: true, messages: body.messages })
}
