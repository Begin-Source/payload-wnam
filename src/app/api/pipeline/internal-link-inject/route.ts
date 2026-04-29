import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { syncBodyLinksToGraph } from '@/services/linkgraph/ingest'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/internal-link-inject'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as { articleId?: string }
  if (!body.articleId) {
    return Response.json({ error: 'articleId required' }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })
  const article = await payload.findByID({
    collection: 'articles',
    id: body.articleId,
    depth: 0,
  })
  if (!article) {
    return Response.json({ error: 'article not found' }, { status: 404 })
  }
  const a = article as { id: string | number; site?: unknown; body?: unknown }
  const site =
    a.site && typeof a.site === 'object' && a.site !== null && 'id' in a.site
      ? String((a.site as { id: unknown }).id)
      : a.site != null
        ? String(a.site)
        : null
  if (!site) {
    return Response.json({ error: 'article has no site' }, { status: 400 })
  }

  const sync = await syncBodyLinksToGraph(payload, {
    siteId: site,
    fromCollection: 'articles',
    fromId: String(a.id),
    body: a.body,
    createdBy: 'pipeline:internal_link_inject',
  })

  return Response.json({
    ok: true,
    articleId: body.articleId,
    graphSync: sync,
    /** Later: same-pillar embedding similarity + Lexical link injection (OpenRouter / Vectorize). */
    external: {
      embeddings: 'placeholder',
      openRouter: 'placeholder',
    },
  })
}
