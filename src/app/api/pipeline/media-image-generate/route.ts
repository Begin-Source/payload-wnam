import configPromise from '@payload-config'
import type { Article } from '@/payload-types'
import { getPayload } from 'payload'

import { makeFeaturedImagePrompt } from '@/app/api/pipeline/lib/articlePipelineChain'
import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import {
  imageExtensionFromMime,
  togetherImageGenerateBytes,
} from '@/services/integrations/together/hidream'
import { incrementSiteQuotaUsage } from '@/utilities/siteQuotaCheck'
import { tenantIdFromRelation } from '@/utilities/tenantScope'
import {
  resolveMediaAiImagePrompt,
  truncateErrorMessage,
} from '@/utilities/mediaAiImagePrompt'
import {
  extractPipelineErrorChainMessage,
  formatD1MediaInsertFailureMessage,
} from '@/utilities/pipelineDbErrorMessage'

export const dynamic = 'force-dynamic'

const PATH = '/api/pipeline/media-image-generate'

function siteIdFromRelation(s: number | { id: number } | null | undefined): number | null {
  if (s == null || s === undefined) return null
  if (typeof s === 'number' && Number.isFinite(s)) return s
  if (typeof s === 'object' && typeof s.id === 'number') return s.id
  return null
}

function siteIdFromMedia(doc: {
  site?: number | { id: number } | null
}): number | null {
  return siteIdFromRelation(doc.site as never)
}

function featuredRelId(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'object' && raw !== null && 'id' in raw) {
    const id = (raw as { id: unknown }).id
    if (typeof id === 'number' && Number.isFinite(id)) return id
  }
  return null
}

function parseNumericId(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim())
  return null
}

function keywordTermFromPost(doc: {
  primaryKeyword?: { term?: string } | number | null
}): string | null {
  const pk = doc.primaryKeyword
  if (pk && typeof pk === 'object' && typeof (pk as { term?: string }).term === 'string') {
    return (pk as { term: string }).term.trim() || null
  }
  return null
}

/** Replace file on existing media (AI prompt from media row). */
async function runReplaceOnMedia(
  payload: Awaited<ReturnType<typeof getPayload>>,
  mediaId: number,
  bodySite: number | null,
): Promise<Response> {
  const doc = await payload.findByID({
    collection: 'media',
    id: String(mediaId),
    depth: 0,
    overrideAccess: true,
  })

  if (!doc) {
    return Response.json({ ok: false, error: 'media not found' }, { status: 404 })
  }

  const row = doc as {
    site?: number | { id: number } | null
    alt?: string
    aiImagePrompt?: string | null
  }

  const mediaSiteId = siteIdFromMedia(row)
  if (mediaSiteId == null) {
    return Response.json({ ok: false, error: 'media has no site' }, { status: 422 })
  }

  if (bodySite != null && bodySite !== mediaSiteId) {
    return Response.json({ ok: false, error: 'siteId mismatch vs media.site' }, { status: 403 })
  }

  const nowIso = new Date().toISOString()

  await payload.update({
    collection: 'media',
    id: String(mediaId),
    data: {
      aiImageGenStatus: 'running',
      aiImageGenError: '',
    },
    overrideAccess: true,
  })

  const resolved = resolveMediaAiImagePrompt({
    aiImagePrompt: row.aiImagePrompt,
    alt: row.alt,
  })

  if (resolved.skipped) {
    await payload.update({
      collection: 'media',
      id: String(mediaId),
      data: {
        aiImageGenStatus: 'skipped',
        aiImageGenError: resolved.skipReason,
        aiImageGenAt: nowIso,
        aiImagePromptSource: '',
      },
      overrideAccess: true,
    })
    return Response.json({
      ok: true,
      skipped: true,
      skipReason: resolved.skipReason,
      mediaId,
    })
  }

  try {
    const { buffer, mimeType } = await togetherImageGenerateBytes(resolved.promptText)
    const ext = imageExtensionFromMime(mimeType)
    const base =
      typeof row.alt === 'string' && row.alt.trim()
        ? row.alt
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, ' ')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 60) || `media-${mediaId}`
        : `media-${mediaId}`
    const name = `${base}-${Date.now()}.${ext}`

    await payload.update({
      collection: 'media',
      id: String(mediaId),
      data: {
        aiImageGenStatus: 'succeeded',
        aiImageGenError: '',
        aiImageGenAt: new Date().toISOString(),
        aiImagePromptSource: resolved.source,
        assetClass: 'decorative',
      },
      file: {
        data: buffer,
        mimetype: mimeType,
        name,
        size: buffer.byteLength,
      },
      overrideAccess: true,
    })

    await incrementSiteQuotaUsage(payload, mediaSiteId, { imagesUsd: 0.05 })

    return Response.json({
      ok: true,
      mediaId,
      mimeType,
      promptSource: resolved.source,
      mode: 'replace',
    })
  } catch (e) {
    const msg = formatD1MediaInsertFailureMessage(e)
    const stored = truncateErrorMessage(extractPipelineErrorChainMessage(e))
    await payload.update({
      collection: 'media',
      id: String(mediaId),
      data: {
        aiImageGenStatus: 'failed',
        aiImageGenError: stored,
        aiImageGenAt: new Date().toISOString(),
        aiImagePromptSource: resolved.source,
      },
      overrideAccess: true,
    })
    return Response.json(
      {
        ok: false,
        error: 'media_image_generate_failed',
        message: msg,
        mediaId,
      },
      { status: 502 },
    )
  }
}

/** Featured image prompt for articles (primaryKeyword); pages omit keyword. */
async function runArticleOrPageFeatured(
  payload: Awaited<ReturnType<typeof getPayload>>,
  args: {
    collection: 'articles' | 'pages'
    docId: number
    bodySite: number | null
  },
): Promise<Response> {
  const doc = await payload.findByID({
    collection: args.collection,
    id: String(args.docId),
    depth: 1,
    overrideAccess: true,
  })

  if (!doc) {
    return Response.json(
      {
        ok: false,
        error: args.collection === 'articles' ? 'article not found' : 'page not found',
      },
      { status: 404 },
    )
  }

  const sid = siteIdFromRelation((doc as { site?: unknown }).site as never)
  if (sid == null) {
    return Response.json({ ok: false, error: 'document has no site' }, { status: 422 })
  }
  if (args.bodySite != null && args.bodySite !== sid) {
    return Response.json({ ok: false, error: 'siteId mismatch vs document.site' }, { status: 403 })
  }

  const title = typeof (doc as { title?: string }).title === 'string' ? (doc as { title: string }).title : ''
  const excerpt =
    typeof (doc as { excerpt?: string | null }).excerpt === 'string'
      ? (doc as { excerpt: string }).excerpt
      : null

  const existingMediaId = featuredRelId((doc as { featuredImage?: unknown }).featuredImage)

  if (existingMediaId != null) {
    return runReplaceOnMedia(payload, existingMediaId, args.bodySite)
  }

  if (!title.trim()) {
    return Response.json({ ok: false, error: 'document title required for new featured image' }, { status: 400 })
  }

  const keywordTerm =
    args.collection === 'articles' ? keywordTermFromPost(doc as Article) : null

  const promptText = makeFeaturedImagePrompt({
    title,
    excerpt,
    keywordTerm,
  })

  if (!promptText.trim()) {
    return Response.json({ ok: false, error: 'empty prompt' }, { status: 400 })
  }

  try {
    const { buffer, mimeType } = await togetherImageGenerateBytes(promptText)
    const ext = imageExtensionFromMime(mimeType)
    const slugBase = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || `${args.collection}-${args.docId}`
    const name = `${slugBase}-hero-${Date.now()}.${ext}`

    const siteRow = await payload.findByID({
      collection: 'sites',
      id: String(sid),
      depth: 0,
      overrideAccess: true,
    })
    const tenantNumeric = tenantIdFromRelation(
      (siteRow as { tenant?: number | { id: number } | null } | null)?.tenant,
    )
    if (tenantNumeric == null) {
      return Response.json(
        {
          ok: false,
          error: 'site_missing_tenant',
          message:
            '该站点未设置 Assigned Tenant（租户），无法在媒体库创建记录。请到「站点」为站点绑定租户后再试。',
        },
        { status: 422 },
      )
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
          message: `站点绑定的租户 id ${tenantNumeric} 在 tenants 表中不存在，请修正站点租户或补全 tenants 数据后再试。`,
        },
        { status: 422 },
      )
    }

    const nowIso = new Date().toISOString()
    const created = await payload.create({
      collection: 'media',
      data: {
        alt: title.slice(0, 240),
        site: sid,
        tenant: tenantNumeric,
        assetClass: 'decorative',
        aiImagePrompt: '',
        aiImageGenStatus: 'succeeded',
        aiImageGenError: '',
        aiImageGenAt: nowIso,
        aiImagePromptSource: 'article_page_featured_auto',
      },
      file: {
        data: buffer,
        mimetype: mimeType,
        name,
        size: buffer.byteLength,
      },
      overrideAccess: true,
    })

    const newMediaId = (created as { id: number }).id

    await payload.update({
      collection: args.collection,
      id: String(args.docId),
      data: {
        featuredImage: newMediaId,
      },
      overrideAccess: true,
    })

    await incrementSiteQuotaUsage(payload, sid, { imagesUsd: 0.05 })

    return Response.json({
      ok: true,
      mediaId: newMediaId,
      mimeType,
      mode: 'create_and_attach',
      [args.collection === 'articles' ? 'articleId' : 'pageId']: args.docId,
    })
  } catch (e) {
    const msg = formatD1MediaInsertFailureMessage(e)
    return Response.json(
      {
        ok: false,
        error: 'media_image_generate_failed',
        message: msg,
      },
      { status: 502 },
    )
  }
}

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }

  const body = (await request.json().catch(() => ({}))) as {
    mediaId?: string | number
    articleId?: string | number
    pageId?: string | number
    siteId?: number
  }

  const payload = await getPayload({ config: configPromise })
  const bodySite =
    typeof body.siteId === 'number' && Number.isFinite(body.siteId) ? body.siteId : null

  const mediaId = parseNumericId(body.mediaId)
  const articleId = parseNumericId(body.articleId)
  const pageId = parseNumericId(body.pageId)

  const modes = [mediaId != null, articleId != null, pageId != null].filter(Boolean).length
  if (modes !== 1) {
    return Response.json(
      { ok: false, error: 'exactly one of mediaId, articleId, pageId is required' },
      { status: 400 },
    )
  }

  if (mediaId != null) {
    return runReplaceOnMedia(payload, mediaId, bodySite)
  }
  if (articleId != null) {
    return runArticleOrPageFeatured(payload, { collection: 'articles', docId: articleId, bodySite })
  }
  return runArticleOrPageFeatured(payload, { collection: 'pages', docId: pageId!, bodySite })
}
