import configPromise from '@payload-config'
import type { Article } from '@/payload-types'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { buildLexicalSkeleton } from '@/services/writing/skeletonBuilder'
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
  const briefNum = typeof body.briefId === 'number' ? body.briefId : Number(body.briefId)
  const outline = (brief as { outline?: { sections?: { id: string }[]; globalContext?: unknown } }).outline
  const gc = outline?.globalContext as { delegateOutline?: string } | undefined
  const delegateOutline =
    typeof gc?.delegateOutline === 'string' && gc.delegateOutline.trim() ? gc.delegateOutline.trim().slice(0, 12000) : ''

  const ids = outline?.sections?.map((s) => s.id) || ['intro', 'body', 'faq', 'conclusion']
  const lexical = buildLexicalSkeleton(ids)
  const title = (brief as { title?: string }).title || 'Article'
  const b = brief as {
    site?: number | { id: number } | null
    tenant?: number | { id: number } | null
    primaryKeyword?: number | { id: number } | null
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
  if (tenantId == null) {
    return Response.json(
      {
        error:
          typeof siteId === 'number' && Number.isFinite(siteId)
            ? '所选站点未关联租户，无法从 Brief 生成文章草稿'
            : '无法解析租户：请确认内容大纲已关联租户或站点',
      },
      { status: 400 },
    )
  }

  const pk =
    typeof b.primaryKeyword === 'object' && b.primaryKeyword?.id != null
      ? b.primaryKeyword.id
      : typeof b.primaryKeyword === 'number' && Number.isFinite(b.primaryKeyword)
        ? b.primaryKeyword
        : undefined

  const sectionSummaries: Record<string, unknown> =
    delegateOutline.length > 0 ? { globalContext: delegateOutline } : {}

  const art = await payload.create({
    collection: 'articles',
    draft: false,
    data: {
      title: title.replace(/^Brief:\s*/i, ''),
      locale: 'en',
      tenant: tenantId,
      ...(typeof siteId === 'number' && Number.isFinite(siteId) ? { site: siteId } : {}),
      ...(Number.isFinite(briefNum) ? { sourceBrief: briefNum } : {}),
      ...(pk != null ? { primaryKeyword: pk } : {}),
      ...(Object.keys(sectionSummaries).length > 0 ? { sectionSummaries } : {}),
      body: lexical as Article['body'],
      status: 'draft',
    },
  })
  return Response.json({ ok: true, articleId: art.id })
}
