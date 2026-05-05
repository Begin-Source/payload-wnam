import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { runDraftFinalizeForArticle } from '@/app/api/pipeline/draft-finalize/runDraftFinalize'
import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { finalizeArticleBodyText } from '@/services/writing/finalizePass'

export const dynamic = 'force-dynamic'

const PATH = '/api/pipeline/draft-finalize'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as {
    bodyText?: string
    articleId?: string | number
  }
  const payload = await getPayload({ config: configPromise })

  const articleIdRaw = body.articleId
  const hasArticle =
    articleIdRaw != null &&
    (typeof articleIdRaw === 'number'
      ? Number.isFinite(articleIdRaw)
      : typeof articleIdRaw === 'string' && /^\d+$/.test(articleIdRaw))

  if (hasArticle) {
    const aid = typeof articleIdRaw === 'number' ? articleIdRaw : Number(articleIdRaw)
    const r = await runDraftFinalizeForArticle(payload, aid)
    if (!r.ok) {
      return Response.json(r, { status: r.status ?? 500 })
    }
    return Response.json({
      ok: true,
      updated: true,
      articleId: r.articleId,
      excerptChars: r.excerptChars,
      finalizeVariant: r.finalizeVariant,
      elapsedMs: r.elapsedMs,
      ...(r.usage ? { usage: r.usage } : {}),
    })
  }

  if (!body.bodyText?.trim()) {
    return Response.json(
      { error: 'bodyText required (unless articleId is set)', ok: false },
      { status: 400 },
    )
  }
  const textOnly = finalizeArticleBodyText(body.bodyText)
  return Response.json({ ok: true, text: textOnly, updated: false })
}
