import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { finalizeArticleBodyText } from '@/services/writing/finalizePass'
import { finalizeLexicalArticleBody, lexicalArticleBodyToPlainText } from '@/services/writing/lexicalBodyPlain'
import type { Article } from '@/payload-types'

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
    const doc = await payload.findByID({
      collection: 'articles',
      id: String(aid),
      depth: 0,
      overrideAccess: true,
    })
    if (!doc) {
      return Response.json({ ok: false, error: 'article not found' }, { status: 404 })
    }
    const nextBody = finalizeLexicalArticleBody((doc as { body?: unknown }).body) as Article['body']
    const plain = lexicalArticleBodyToPlainText(nextBody).split(/\n\n/)[0] ?? ''
    const excerptSlice = plain.replace(/\s+/g, ' ').trim().slice(0, 200)

    await payload.update({
      collection: 'articles',
      id: String(aid),
      data: {
        body: nextBody,
        ...(excerptSlice ? { excerpt: excerptSlice } : {}),
      },
      overrideAccess: true,
    })
    return Response.json({ ok: true, updated: true, articleId: aid, excerptChars: excerptSlice.length })
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
