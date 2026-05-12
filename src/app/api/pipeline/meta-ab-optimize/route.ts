import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { pickSeoTitle, writeSeoTitleCandidates } from '@/utilities/seoTitleWriter'

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
    keyword?: string
    applyBest?: boolean
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
  let keyword = typeof body.keyword === 'string' ? body.keyword.trim() : ''
  let article: Record<string, unknown> | null = null
  if (!baseTitle) {
    try {
      article = (await payload.findByID({ collection: 'articles', id: String(id), depth: 1 })) as Record<
        string,
        unknown
      >
      baseTitle = (article as { title?: string }).title?.trim() || 'Page'
      const primaryKeyword = article.primaryKeyword
      if (!keyword && primaryKeyword && typeof primaryKeyword === 'object') {
        const term = (primaryKeyword as { term?: unknown }).term
        const slug = (primaryKeyword as { slug?: unknown }).slug
        keyword =
          typeof term === 'string' && term.trim() ? term.trim()
          : typeof slug === 'string' && slug.trim() ? slug.trim()
          : ''
      }
    } catch {
      baseTitle = 'Page'
    }
  }

  const startedAt = new Date().toISOString()
  const variants = writeSeoTitleCandidates({ keyword, fallbackTitle: baseTitle })
  const best = pickSeoTitle({ keyword, fallbackTitle: baseTitle })
  const metaVariants = {
    startedAt,
    variants,
    experimentDays: 14,
    championVariantId: best.id,
    pickReason: 'seo_title_writer_deterministic',
  }

  const updateData: Record<string, unknown> = {
    metaVariants: metaVariants as Record<string, unknown>,
  }
  if (body.applyBest === true) {
    updateData.title = best.title
    updateData.meta = { title: best.title, description: best.description }
  }

  await payload.update({
    collection: 'articles',
    id,
    data: updateData,
    overrideAccess: true,
  })

  return Response.json({
    ok: true,
    articleId: id,
    metaVariants,
    applied: body.applyBest === true,
    handoff: {
      status: 'DONE',
      objective: 'SEO title/meta candidates stored on article',
      recommendedNextSkill: 'performance-reporter',
    },
  })
}
