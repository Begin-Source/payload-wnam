import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { resolvePipelineConfig } from '@/utilities/resolvePipelineConfig'
import { tenantIdFromRelation } from '@/utilities/tenantScope'
import { normalizeBriefVariant } from '@/utilities/pipelineVariants'

import { runBriefGeneration } from '@/app/api/pipeline/brief-generate/runBriefGeneration'

export const dynamic = 'force-dynamic'

const PATH = '/api/pipeline/brief-generate'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as { keywordId?: string | number; siteId?: number }
  const payload = await getPayload({ config: configPromise })
  if (!body.keywordId) {
    return Response.json({ error: 'keywordId required' }, { status: 400 })
  }
  const kw = await payload.findByID({
    collection: 'keywords',
    id: String(body.keywordId),
    depth: 0,
    overrideAccess: true,
  })
  const kid =
    typeof body.keywordId === 'number' ?
      body.keywordId
    : Number(body.keywordId)
  if (!Number.isFinite(kid)) {
    return Response.json({ error: 'keywordId invalid' }, { status: 400 })
  }

  const term = (kw as { term?: string }).term || 'topic'
  const siteId =
    body.siteId ??
    (typeof (kw as { site?: number | { id: number } | null })?.site === 'object' &&
    (kw as { site?: { id: number } | null })?.site
      ? (kw as { site: { id: number } }).site.id
      : (kw as { site?: number | null })?.site) ??
    undefined

  let tenantId = tenantIdFromRelation((kw as { tenant?: number | { id: number } | null }).tenant)
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
  if (tenantId == null) {
    return Response.json(
      {
        error:
          typeof siteId === 'number' && Number.isFinite(siteId)
            ? '所选站点未关联租户，无法创建内容大纲'
            : '无法解析租户：请确认关键词与站点已关联租户',
      },
      { status: 400 },
    )
  }

  const pipelineCfg = await resolvePipelineConfig({
    payload,
    tenantId,
    siteId: typeof siteId === 'number' && Number.isFinite(siteId) ? siteId : undefined,
  })
  const merged = pipelineCfg.merged
  const briefVariant = normalizeBriefVariant(merged.briefVariant)

  const run = await runBriefGeneration({
    payload,
    merged,
    pipelineCfg,
    tenantId,
    siteId,
    keywordId: kid,
    term,
    variant: briefVariant,
  })

  if (!run.ok) {
    return Response.json({ error: run.error }, { status: 502 })
  }
  return Response.json({ ok: true, id: run.id })
}
