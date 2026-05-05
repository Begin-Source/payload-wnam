import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { runDraftSkeletonFromBrief } from '@/app/api/pipeline/draft-skeleton/runDraftSkeleton'
import { normalizeGlobalPipelineDoc } from '@/utilities/pipelineSettingShape'
import { resolvePipelineConfig } from '@/utilities/resolvePipelineConfig'
import { tenantIdFromRelation } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

const PATH = '/api/pipeline/draft-skeleton'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as { briefId?: string | number; siteId?: number }
  const payload = await getPayload({ config: configPromise })
  if (!body.briefId) {
    return Response.json({ error: 'briefId required' }, { status: 400 })
  }

  const brief = await payload.findByID({
    collection: 'content-briefs',
    id: String(body.briefId),
    depth: 0,
    overrideAccess: true,
  })

  const b = brief as {
    site?: number | { id: number } | null
    tenant?: number | { id: number } | null
  }
  const siteId =
    typeof b.site === 'object' && b.site?.id != null
      ? b.site.id
      : typeof b.site === 'number'
        ? b.site
        : body.siteId

  let tenantId = tenantIdFromRelation(b.tenant)
  if (tenantId == null && typeof siteId === 'number' && Number.isFinite(siteId)) {
    try {
      const site = await payload.findByID({
        collection: 'sites',
        id: siteId,
        depth: 0,
        overrideAccess: true,
      })
      tenantId = tenantIdFromRelation((site as { tenant?: number | { id: number } | null }).tenant)
    } catch {
      tenantId = null
    }
  }

  let merged = normalizeGlobalPipelineDoc(
    (await payload.findGlobal({ slug: 'pipeline-settings', depth: 0 })) as Record<string, unknown>,
  )
  if (tenantId != null && typeof siteId === 'number' && Number.isFinite(siteId)) {
    merged = (
      await resolvePipelineConfig({
        payload,
        tenantId,
        siteId,
      })
    ).merged
  }

  const run = await runDraftSkeletonFromBrief(payload, {
    briefId: body.briefId,
    ...(typeof body.siteId === 'number' && Number.isFinite(body.siteId) ? { siteIdOverride: body.siteId } : {}),
    merged,
  })

  if (!run.ok) {
    return Response.json({ ok: false, error: run.error }, { status: run.status ?? 500 })
  }
  return Response.json({ ok: true, articleId: run.articleId })
}
