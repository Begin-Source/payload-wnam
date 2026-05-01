import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { incrementSiteQuotaUsage } from '@/utilities/siteQuotaCheck'
import { writeSectionIntoArticleBody } from '@/services/writing/writeSectionIntoArticleBody'
import { runSectionPrompt } from '@/services/writing/sectionExecutor'

export const dynamic = 'force-dynamic'

const PATH = '/api/pipeline/draft-section'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as {
    model?: string
    sectionId?: string
    sectionType?: string
    previousSectionSummary?: string
    globalContext?: string
    articleId?: string | number
    briefId?: string | number
  }
  if (!body.sectionId) {
    return Response.json({ error: 'sectionId required' }, { status: 400 })
  }
  const text = await runSectionPrompt({
    model: body.model || 'openai/gpt-4o-mini',
    sectionId: body.sectionId,
    sectionType: body.sectionType || 'custom',
    previousSectionSummary: body.previousSectionSummary,
    globalContext: body.globalContext || '',
  })

  let written = false
  const payload = await getPayload({ config: configPromise })

  if (body.articleId != null) {
    const aid =
      typeof body.articleId === 'number' ? body.articleId : Number(body.articleId)
    if (!Number.isFinite(aid)) {
      return Response.json({ error: 'articleId invalid' }, { status: 400 })
    }
    const w = await writeSectionIntoArticleBody(payload, {
      articleId: aid,
      sectionId: body.sectionId,
      sectionMarkdown: text,
    })
    if (!w.ok) {
      return Response.json(
        {
          ok: false,
          error: w.reason,
          text,
          sectionId: body.sectionId,
          articleId: aid,
        },
        { status: 422 },
      )
    }
    written = true
    try {
      const doc = await payload.findByID({
        collection: 'articles',
        id: String(aid),
        depth: 0,
        overrideAccess: true,
      })
      const siteRaw = (doc as { site?: number | { id: number } | null })?.site
      const siteRel =
        typeof siteRaw === 'object' && siteRaw?.id != null
          ? siteRaw.id
          : typeof siteRaw === 'number'
            ? siteRaw
            : null
      if (typeof siteRel === 'number' && Number.isFinite(siteRel)) {
        await incrementSiteQuotaUsage(payload, siteRel, { openrouterUsd: 0.02 })
      }
    } catch {
      /* optional quota */
    }
  }

  return Response.json({
    ok: true,
    text,
    sectionId: body.sectionId,
    articleId:
      body.articleId != null
        ? typeof body.articleId === 'number'
          ? body.articleId
          : Number(body.articleId)
        : null,
    written,
    briefId:
      typeof body.briefId === 'number'
        ? body.briefId
        : typeof body.briefId === 'string'
          ? Number(body.briefId)
          : null,
    handoff: {
      recommendedNextSkill: body.articleId != null ? 'pipeline-draft-finalize' : '',
    },
  })
}
