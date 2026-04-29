import configPromise from '@payload-config'
import type { Article } from '@/payload-types'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { buildLexicalSkeleton } from '@/services/writing/skeletonBuilder'

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
  const brief = await payload.findByID({ collection: 'content-briefs', id: String(body.briefId) })
  const outline = (brief as { outline?: { sections?: { id: string }[] } }).outline
  const ids = outline?.sections?.map((s) => s.id) || ['intro', 'body', 'faq', 'conclusion']
  const lexical = buildLexicalSkeleton(ids)
  const title = (brief as { title?: string }).title || 'Article'
  const b = brief as { site?: number | { id: number } | null }
  const siteId =
    typeof b.site === 'object' && b.site?.id != null
      ? b.site.id
      : typeof b.site === 'number'
        ? b.site
        : body.siteId
  const art = await payload.create({
    collection: 'articles',
    draft: false,
    data: {
      title: title.replace(/^Brief:\s*/i, ''),
      locale: 'en',
      ...(typeof siteId === 'number' && Number.isFinite(siteId) ? { site: siteId } : {}),
      body: lexical as Article['body'],
      status: 'draft',
    },
  })
  return Response.json({ ok: true, articleId: art.id })
}
