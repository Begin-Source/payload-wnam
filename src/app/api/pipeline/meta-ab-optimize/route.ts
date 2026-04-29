import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/meta-ab-optimize'

/**
 * 钉子 5：产出 2–3 组 title/description 候选并写入 `articles.metaVariants`。
 */
export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as {
    articleId?: string | number
    title?: string
  }
  if (body.articleId == null) {
    return Response.json({ error: 'articleId required' }, { status: 400 })
  }
  const payload = await getPayload({ config: configPromise })
  const id = typeof body.articleId === 'number' ? body.articleId : Number(body.articleId)
  if (!Number.isFinite(id)) {
    return Response.json({ error: 'articleId invalid' }, { status: 400 })
  }

  let baseTitle = typeof body.title === 'string' ? body.title.trim() : ''
  if (!baseTitle) {
    try {
      const art = await payload.findByID({ collection: 'articles', id: String(id), depth: 0 })
      baseTitle = (art as { title?: string }).title?.trim() || 'Page'
    } catch {
      baseTitle = 'Page'
    }
  }

  const startedAt = new Date().toISOString()
  const variants = [
    { id: 'a', title: `${baseTitle} — A`, description: 'Variant A meta description.' },
    { id: 'b', title: `${baseTitle} — B`, description: 'Variant B meta description.' },
    { id: 'c', title: `${baseTitle} — C`, description: 'Variant C meta description.' },
  ]
  const metaVariants = { startedAt, variants, experimentDays: 14 }

  await payload.update({
    collection: 'articles',
    id,
    data: { metaVariants: metaVariants as Record<string, unknown> },
    overrideAccess: true,
  })

  return Response.json({
    ok: true,
    articleId: id,
    metaVariants,
    handoff: {
      status: 'DONE',
      objective: 'Meta A/B candidates stored on article',
      recommendedNextSkill: 'performance-reporter',
    },
  })
}
