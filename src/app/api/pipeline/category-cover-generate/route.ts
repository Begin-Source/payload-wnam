import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { runCategoryCoverGenerate } from '@/utilities/categoryCover/runCategoryCoverGenerate'

export const dynamic = 'force-dynamic'

const PATH = '/api/pipeline/category-cover-generate'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }

  const body = (await request.json().catch(() => ({}))) as {
    categoryId?: string | number
    siteId?: number
    prompt?: string | null
  }

  const categoryId =
    typeof body.categoryId === 'number'
      ? body.categoryId
      : typeof body.categoryId === 'string' && /^\d+$/.test(body.categoryId.trim())
        ? Number(body.categoryId.trim())
        : NaN

  if (!Number.isFinite(categoryId)) {
    return Response.json({ ok: false, error: 'categoryId required (number)' }, { status: 400 })
  }

  const bodySite = typeof body.siteId === 'number' && Number.isFinite(body.siteId) ? body.siteId : null

  const payload = await getPayload({ config: configPromise })
  const result = await runCategoryCoverGenerate(payload, categoryId, {
    expectedSiteId: bodySite,
    prompt: typeof body.prompt === 'string' ? body.prompt : null,
  })

  if (result.ok) {
    return Response.json({
      ok: true,
      categoryId: result.categoryId,
      mediaId: result.mediaId,
      mode: result.mode,
      mimeType: result.mimeType,
    })
  }

  return Response.json(
    {
      ok: false,
      error: result.error,
      ...(result.message ? { message: result.message } : {}),
      ...(result.categoryId !== undefined ? { categoryId: result.categoryId } : {}),
      ...(result.detail ? { detail: result.detail } : {}),
    },
    { status: result.httpStatus },
  )
}
