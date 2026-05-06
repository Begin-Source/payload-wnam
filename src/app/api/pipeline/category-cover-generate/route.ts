import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import {
  imageExtensionFromMime,
  togetherImageGenerateBytes,
} from '@/services/integrations/together/hidream'
import type { Category, Site } from '@/payload-types'
import { TOGETHER_CATEGORY_COVER_PROMPT } from '@/utilities/domainGeneration/promptKeys'
import { makeCategoryCoverImagePrompt } from '@/utilities/categoryCoverMedia'
import { resolveTogetherTenantPrompt } from '@/utilities/togetherTenantPrompts/resolveTogetherTenantPrompt'
import { buildCategoryCoverTogetherVars } from '@/utilities/togetherTenantPrompts/togetherImagePromptTemplates'
import { truncateErrorMessage } from '@/utilities/mediaAiImagePrompt'
import {
  extractPipelineErrorChainMessage,
  formatD1MediaInsertFailureMessage,
} from '@/utilities/pipelineDbErrorMessage'
import { resolvePipelineConfigForSite } from '@/utilities/resolvePipelineConfig'
import { recordTogetherImageAiCost } from '@/utilities/aiCostLog'
import { resolveTogetherImageChargeUsd } from '@/utilities/aiCostPricing'
import { incrementSiteQuotaUsage } from '@/utilities/siteQuotaCheck'
import { tenantIdFromRelation } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

const PATH = '/api/pipeline/category-cover-generate'

function featuredRelId(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'object' && raw !== null && 'id' in raw) {
    const id = (raw as { id: unknown }).id
    if (typeof id === 'number' && Number.isFinite(id)) return id
  }
  return null
}

function siteIdFromCategory(doc: Pick<Category, 'site'>): number | null {
  const s = doc.site
  if (s == null) return null
  return typeof s === 'object' && s !== null && 'id' in s
    ? (s as Site).id
    : typeof s === 'number'
      ? s
      : null
}

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
  const cat = await payload.findByID({
    collection: 'categories',
    id: String(categoryId),
    depth: 1,
    overrideAccess: true,
  })

  if (!cat) {
    return Response.json({ ok: false, error: 'category_not_found' }, { status: 404 })
  }

  const cid = cat as Category
  const catSiteNum = siteIdFromCategory(cid)
  if (catSiteNum == null) {
    return Response.json({ ok: false, error: 'category has no site' }, { status: 422 })
  }
  if (bodySite != null && bodySite !== catSiteNum) {
    return Response.json({ ok: false, error: 'siteId mismatch vs category.site' }, { status: 403 })
  }

  const catName =
    typeof cid.name === 'string' && cid.name.trim()
      ? cid.name.trim()
      : typeof cid.slug === 'string' && cid.slug.trim()
        ? cid.slug.trim()
        : 'Category'
  const slug = typeof cid.slug === 'string' ? cid.slug.trim() : String(cid.id)
  const descRaw = cid.description
  const desc = typeof descRaw === 'string' ? descRaw : null

  let siteBrand: string | null = null
  const siteRel = cid.site
  if (siteRel != null && typeof siteRel === 'object' && 'name' in siteRel) {
    const nm = (siteRel as Site).name
    if (typeof nm === 'string' && nm.trim()) siteBrand = nm.trim()
  }

  const siteForTenant = await payload.findByID({
    collection: 'sites',
    id: String(catSiteNum),
    depth: 0,
    overrideAccess: true,
  })
  if (!siteForTenant) {
    return Response.json({ ok: false, error: 'site_not_found' }, { status: 404 })
  }

  const overridePrompt = typeof body.prompt === 'string' ? body.prompt : null
  const hasPromptOverride = Boolean(overridePrompt?.trim())
  const categoryPromptParts = {
    categoryName: catName,
    slug,
    description: desc,
    siteName: siteBrand,
  } as const
  const defaultCategoryPrompt = makeCategoryCoverImagePrompt({
    ...categoryPromptParts,
    override: null,
  })
  const promptText = hasPromptOverride
    ? makeCategoryCoverImagePrompt({
        ...categoryPromptParts,
        override: overridePrompt,
      })
    : await resolveTogetherTenantPrompt(
        payload,
        tenantIdFromRelation((siteForTenant as Site).tenant),
        TOGETHER_CATEGORY_COVER_PROMPT,
        defaultCategoryPrompt,
        buildCategoryCoverTogetherVars(categoryPromptParts),
      )

  if (!promptText.trim()) {
    return Response.json({ ok: false, error: 'empty prompt' }, { status: 400 })
  }

  const pipe = await resolvePipelineConfigForSite(payload, catSiteNum)
  if ('ok' in pipe) {
    return Response.json(
      { ok: false, error: 'pipeline_resolve_failed', message: pipe.error },
      { status: 422 },
    )
  }
  if (!pipe.merged.togetherImageEnabled) {
    return Response.json(
      {
        ok: false,
        error: 'together_image_disabled',
        message: '当前流水线配置已关闭 Together 生图。',
      },
      { status: 400 },
    )
  }
  const imageModel = pipe.merged.defaultImageModel?.trim() || undefined

  const existingMediaId = featuredRelId(cid.coverImage)
  const nowIso = new Date().toISOString()

  try {
    const { buffer, mimeType, raw } = await togetherImageGenerateBytes(promptText, {
      model: imageModel,
    })
    const ext = imageExtensionFromMime(mimeType)
    const base = slug
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60)
    const name = `${base || `category-${categoryId}`}-cover-${Date.now()}.${ext}`

    if (existingMediaId != null) {
      const mdoc = await payload.findByID({
        collection: 'media',
        id: String(existingMediaId),
        depth: 0,
        overrideAccess: true,
      })
      if (!mdoc) {
        return Response.json({ ok: false, error: 'cover media missing' }, { status: 404 })
      }

      const s = (mdoc as { site?: number | { id: number } | null }).site
      const mediaSid =
        s == null
          ? null
          : typeof s === 'number' && Number.isFinite(s)
            ? s
            : typeof s === 'object' && typeof s.id === 'number'
              ? s.id
              : null
      if (mediaSid == null) {
        return Response.json(
          { ok: false, error: 'cover media missing site on row' },
          { status: 422 },
        )
      }
      if (mediaSid !== catSiteNum) {
        return Response.json(
          { ok: false, error: 'cover media site mismatches category site' },
          { status: 403 },
        )
      }

      await payload.update({
        collection: 'media',
        id: String(existingMediaId),
        data: {
          aiImageGenStatus: 'succeeded',
          aiImageGenError: '',
          aiImageGenAt: nowIso,
          aiImagePromptSource: 'category_cover_auto',
          alt: `${catName} category cover`,
          aiImagePrompt: promptText.slice(0, 2000),
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

      await incrementSiteQuotaUsage(payload, catSiteNum, {
        imagesUsd: resolveTogetherImageChargeUsd({ raw, kind: 'category_cover_auto' }).usd,
      })

      await recordTogetherImageAiCost({
        payload,
        target: { collection: 'media', id: existingMediaId },
        raw,
        kind: 'category_cover_auto',
        model: imageModel ?? null,
      })

      return Response.json({
        ok: true,
        categoryId,
        mediaId: existingMediaId,
        mode: 'replace',
        mimeType,
      })
    }

    const siteRow = await payload.findByID({
      collection: 'sites',
      id: String(catSiteNum),
      depth: 0,
      overrideAccess: true,
    })
    const tenantNumeric = tenantIdFromRelation((siteRow as { tenant?: unknown } | null)?.tenant)

    if (tenantNumeric == null) {
      return Response.json(
        {
          ok: false,
          error: 'site_missing_tenant',
          message:
            '该站点未设置 Assigned Tenant，无法在媒体库创建记录。',
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
          message: `租户 id ${tenantNumeric} 不存在。`,
        },
        { status: 422 },
      )
    }

    const created = await payload.create({
      collection: 'media',
      data: {
        alt: `${catName} category cover`,
        site: catSiteNum,
        tenant: tenantNumeric,
        assetClass: 'decorative',
        aiImagePrompt: promptText.slice(0, 2000),
        aiImageGenStatus: 'succeeded',
        aiImageGenError: '',
        aiImageGenAt: nowIso,
        aiImagePromptSource: 'category_cover_auto',
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
      collection: 'categories',
      id: String(categoryId),
      data: {
        coverImage: newMediaId,
      },
      overrideAccess: true,
    })

    await incrementSiteQuotaUsage(payload, catSiteNum, {
      imagesUsd: resolveTogetherImageChargeUsd({ raw, kind: 'category_cover_auto' }).usd,
    })

    await recordTogetherImageAiCost({
      payload,
      target: { collection: 'media', id: newMediaId },
      raw,
      kind: 'category_cover_auto',
      model: imageModel ?? null,
    })

    return Response.json({
      ok: true,
      categoryId,
      mediaId: newMediaId,
      mode: 'create_and_attach',
      mimeType,
    })
  } catch (e) {
    const msg = formatD1MediaInsertFailureMessage(e)
    const stored = truncateErrorMessage(extractPipelineErrorChainMessage(e))
    await payload.logger.error({ err: stored, categoryId }, 'category_cover_generate_failed')
    return Response.json(
      {
        ok: false,
        error: 'category_cover_generate_failed',
        message: msg,
        categoryId,
        detail: stored,
      },
      { status: 502 },
    )
  }
}
