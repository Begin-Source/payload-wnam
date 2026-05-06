import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { togetherImageGenerate } from '@/services/integrations/together/hidream'
import { resolveTogetherImageChargeUsd } from '@/utilities/aiCostPricing'
import { formatD1MediaInsertFailureMessage } from '@/utilities/pipelineDbErrorMessage'
import { incrementSiteQuotaUsage } from '@/utilities/siteQuotaCheck'
import { resolveMergedForPipelineRoute } from '@/utilities/resolvePipelineConfig'
import { tenantIdFromRelation } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

const PATH = '/api/pipeline/image-generate'

function extFromContentType(ct: string | undefined): string {
  const c = (ct ?? '').toLowerCase()
  if (c.includes('webp')) return 'webp'
  if (c.includes('jpeg') || c.includes('jpg')) return 'jpg'
  if (c.includes('png')) return 'png'
  return 'png'
}

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as {
    prompt: string
    siteId?: number
    articleId?: string | number
    asFeatured?: boolean
  }
  const payload = await getPayload({ config: configPromise })
  if (!body.prompt?.trim()) {
    return Response.json({ ok: false, error: 'prompt required' }, { status: 400 })
  }

  let siteNumeric =
    typeof body.siteId === 'number' && Number.isFinite(body.siteId) ? body.siteId : null
  let articleNumeric: number | null = null
  if (body.articleId != null) {
    const n = typeof body.articleId === 'number' ? body.articleId : Number(body.articleId)
    articleNumeric = Number.isFinite(n) ? n : null
    if (articleNumeric != null && siteNumeric == null) {
      try {
        const article = await payload.findByID({
          collection: 'articles',
          id: String(articleNumeric),
          depth: 0,
          overrideAccess: true,
        })
        const s = (article as { site?: number | { id: number } | null }).site
        siteNumeric =
          typeof s === 'object' && s?.id != null ? s.id : typeof s === 'number' ? s : null
      } catch {
        /* ignore */
      }
    }
  }

  const merged = await resolveMergedForPipelineRoute({
    payload,
    siteId: siteNumeric,
    articleId: articleNumeric,
  })
  if (!merged.togetherImageEnabled) {
    return Response.json(
      {
        ok: false,
        error: 'together_image_disabled',
        message: '当前流水线配置已关闭 Together 生图。',
      },
      { status: 403 },
    )
  }
  const imageModel = merged.defaultImageModel?.trim() || undefined

  let urlRemote: string
  let togetherGenRaw: unknown
  try {
    const r = await togetherImageGenerate(body.prompt, imageModel ? { model: imageModel } : undefined)
    urlRemote = r.url
    togetherGenRaw = r.raw
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }

  const mediaSite = siteNumeric

  /** Legacy: Together URL only when no site to attach uploads to. */
  if (!mediaSite) {
    return Response.json({
      ok: true,
      urlRemote,
      prompt: body.prompt,
      note: 'no_site:no_media_created',
    })
  }

  let mediaId: number | undefined
  try {
    const siteDoc = await payload.findByID({
      collection: 'sites',
      id: String(mediaSite),
      depth: 0,
      overrideAccess: true,
    })
    const tenantNumeric = tenantIdFromRelation(
      (siteDoc as { tenant?: number | { id: number } | null } | null)?.tenant,
    )
    if (tenantNumeric == null) {
      return Response.json({
        ok: false,
        error: 'site_missing_tenant',
        message:
          '该站点未设置 Assigned Tenant（租户），无法在媒体库创建记录。请到「站点」为站点绑定租户后再试。',
        urlRemote,
        prompt: body.prompt,
      }, { status: 422 })
    }

    const tenantRow = await payload.findByID({
      collection: 'tenants',
      id: String(tenantNumeric),
      depth: 0,
      overrideAccess: true,
    })
    if (!tenantRow) {
      return Response.json(
        {
          ok: false,
          error: 'tenant_record_missing',
          message:
            '站点绑定的租户 id ' +
            String(tenantNumeric) +
            ' 在 tenants 表中不存在，请修正站点租户或补全 tenants 数据后再试。',
          urlRemote,
          prompt: body.prompt,
        },
        { status: 422 },
      )
    }

    const imgRes = await fetch(urlRemote)
    if (!imgRes.ok) {
      throw new Error('download image ' + String(imgRes.status))
    }
    const mime = imgRes.headers.get('content-type') ?? 'image/png'
    const buf = new Uint8Array(await imgRes.arrayBuffer())
    const ext = extFromContentType(mime)
    const name =
      typeof articleNumeric === 'number' && Number.isFinite(articleNumeric)
        ? 'article-' + String(articleNumeric) + '-hero.' + ext
        : 'hero-' + Date.now() + '.' + ext

    const created = await payload.create({
      collection: 'media',
      data: {
        alt:
          typeof body.prompt === 'string'
            ? body.prompt.slice(0, 240)
            : 'Pipeline featured image'.slice(0, 240),
        site: mediaSite,
        tenant: tenantNumeric,
        assetClass: 'decorative',
      },
      file: {
        data: buf,
        mimetype: mime,
        name,
        size: buf.byteLength,
      },
      overrideAccess: true,
    })
    mediaId = (created as { id: number }).id

    if (body.asFeatured === true && articleNumeric != null) {
      await payload.update({
        collection: 'articles',
        id: String(articleNumeric),
        data: { featuredImage: mediaId },
        overrideAccess: true,
      })
    }

    try {
      await incrementSiteQuotaUsage(payload, mediaSite, {
        imagesUsd: resolveTogetherImageChargeUsd({
          raw: togetherGenRaw,
          kind: 'pipeline_image_generate',
        }).usd,
      })
    } catch {
      /* optional quota */
    }
  } catch (e) {
    return Response.json({
      ok: false,
      error: 'image_fetch_or_upload_failed',
      message: formatD1MediaInsertFailureMessage(e),
      prompt: body.prompt,
      urlRemote,
    })
  }

  return Response.json({
    ok: true,
    urlRemote,
    mediaId,
    ...(articleNumeric != null ? { articleId: articleNumeric } : {}),
    prompt: body.prompt,
  })
}
