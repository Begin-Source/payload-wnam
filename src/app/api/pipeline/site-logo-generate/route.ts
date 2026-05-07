import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import {
  imageExtensionFromMime,
  togetherImageGenerateBytes,
} from '@/services/integrations/together/hidream'
import type { Site, SiteBlueprint } from '@/payload-types'
import { TOGETHER_SITE_LOGO_PROMPT } from '@/utilities/domainGeneration/promptKeys'
import {
  composeSiteLogoPromptFromSiteBlueprint,
  siteLogoImageDimensions,
} from '@/utilities/siteLogoMedia'
import { resolveTogetherTenantPrompt } from '@/utilities/togetherTenantPrompts/resolveTogetherTenantPrompt'
import { buildSiteLogoTogetherVars } from '@/utilities/togetherTenantPrompts/togetherImagePromptTemplates'
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

const PATH = '/api/pipeline/site-logo-generate'

function featuredRelId(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'object' && raw !== null && 'id' in raw) {
    const id = (raw as { id: unknown }).id
    if (typeof id === 'number' && Number.isFinite(id)) return id
  }
  return null
}

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }

  const body = (await request.json().catch(() => ({}))) as {
    siteId?: string | number
    prompt?: string | null
  }

  const siteId =
    typeof body.siteId === 'number'
      ? body.siteId
      : typeof body.siteId === 'string' && /^\d+$/.test(body.siteId.trim())
        ? Number(body.siteId.trim())
        : NaN

  if (!Number.isFinite(siteId)) {
    return Response.json({ ok: false, error: 'siteId required (number)' }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })
  const row = await payload.findByID({
    collection: 'sites',
    id: String(siteId),
    depth: 0,
    overrideAccess: true,
  })

  if (!row) {
    return Response.json({ ok: false, error: 'site_not_found' }, { status: 404 })
  }

  const siteRow = row as Site
  const layout = typeof siteRow.siteLayout === 'string' ? siteRow.siteLayout : ''
  if (layout !== 'amz-template-1' && layout !== 'amz-template-2') {
    return Response.json(
      {
        ok: false,
        error: 'site_layout_not_amz',
        message: '站点 Logo 生成仅适用于 amz-template-1 / amz-template-2。',
      },
      { status: 422 },
    )
  }

  const bpFind = await payload.find({
    collection: 'site-blueprints',
    where: { site: { equals: siteId } },
    limit: 1,
    sort: '-updatedAt',
    depth: 0,
    overrideAccess: true,
  })
  const blueprint = (bpFind.docs[0] as SiteBlueprint | undefined) ?? null

  const overridePrompt = typeof body.prompt === 'string' ? body.prompt : null
  const hasPromptOverride = Boolean(overridePrompt?.trim())
  const defaultLogoPrompt = composeSiteLogoPromptFromSiteBlueprint(siteRow, blueprint, null)
  const promptText = hasPromptOverride
    ? composeSiteLogoPromptFromSiteBlueprint(siteRow, blueprint, overridePrompt)
    : await resolveTogetherTenantPrompt(
        payload,
        tenantIdFromRelation(siteRow.tenant),
        TOGETHER_SITE_LOGO_PROMPT,
        defaultLogoPrompt,
        buildSiteLogoTogetherVars(siteRow, blueprint),
      )
  if (!promptText.trim()) {
    return Response.json({ ok: false, error: 'empty prompt' }, { status: 400 })
  }

  const pipe = await resolvePipelineConfigForSite(payload, siteId)
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
        message: '当前生效流水线已关闭 Together 生图。',
      },
      { status: 400 },
    )
  }
  const imageModel = pipe.merged.defaultImageModel?.trim() || undefined

  const { width: genW, height: genH } = siteLogoImageDimensions()
  const existingMediaId = featuredRelId(siteRow.siteLogo)
  const nowIso = new Date().toISOString()
  const slug =
    typeof siteRow.slug === 'string' && siteRow.slug.trim()
      ? siteRow.slug.trim()
      : String(siteId)
  const siteName =
    typeof siteRow.name === 'string' && siteRow.name.trim() ? siteRow.name.trim() : slug

  try {
    const { buffer, mimeType, raw } = await togetherImageGenerateBytes(promptText, {
      width: genW,
      height: genH,
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
    const name = `${base || `site-${siteId}`}-logo-${Date.now()}.${ext}`

    const tenantNumeric = tenantIdFromRelation(siteRow.tenant)
    if (tenantNumeric == null) {
      return Response.json(
        {
          ok: false,
          error: 'site_missing_tenant',
          message: '该站点未设置 Assigned Tenant，无法在媒体库创建记录。',
        },
        { status: 422 },
      )
    }

    const tenantDoc = await payload.findByID({
      collection: 'tenants',
      id: String(tenantNumeric),
      depth: 0,
      overrideAccess: true,
    })
    if (!tenantDoc) {
      return Response.json(
        {
          ok: false,
          error: 'tenant_record_missing',
          message: `租户 id ${tenantNumeric} 不存在。`,
        },
        { status: 422 },
      )
    }

    if (existingMediaId != null) {
      const mdoc = await payload.findByID({
        collection: 'media',
        id: String(existingMediaId),
        depth: 0,
        overrideAccess: true,
      })
      if (!mdoc) {
        return Response.json({ ok: false, error: 'site logo media missing' }, { status: 404 })
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
      if (mediaSid == null || mediaSid !== siteId) {
        return Response.json(
          {
            ok: false,
            error: 'logo media site mismatch',
            message: '现有 Logo 媒体不属于该站点，请先在后台解除关联或使用正确站点。',
          },
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
          aiImagePromptSource: 'site_logo_auto',
          alt: `${siteName} — site logo / favicon`,
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

      await incrementSiteQuotaUsage(payload, siteId, {
        imagesUsd: resolveTogetherImageChargeUsd({ raw, kind: 'site_logo_auto' }).usd,
      })

      await recordTogetherImageAiCost({
        payload,
        target: { collection: 'media', id: existingMediaId },
        raw,
        kind: 'site_logo_auto',
        model: imageModel ?? null,
      })

      return Response.json({
        ok: true,
        siteId,
        mediaId: existingMediaId,
        mode: 'replace',
        mimeType,
      })
    }

    const created = await payload.create({
      collection: 'media',
      data: {
        alt: `${siteName} — site logo / favicon`,
        site: siteId,
        tenant: tenantNumeric,
        assetClass: 'decorative',
        aiImagePrompt: promptText.slice(0, 2000),
        aiImageGenStatus: 'succeeded',
        aiImageGenError: '',
        aiImageGenAt: nowIso,
        aiImagePromptSource: 'site_logo_auto',
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
      collection: 'sites',
      id: String(siteId),
      data: {
        siteLogo: newMediaId,
      },
      overrideAccess: true,
    })

    await incrementSiteQuotaUsage(payload, siteId, {
      imagesUsd: resolveTogetherImageChargeUsd({ raw, kind: 'site_logo_auto' }).usd,
    })

    await recordTogetherImageAiCost({
      payload,
      target: { collection: 'media', id: newMediaId },
      raw,
      kind: 'site_logo_auto',
      model: imageModel ?? null,
    })

    return Response.json({
      ok: true,
      siteId,
      mediaId: newMediaId,
      mode: 'create_and_attach',
      mimeType,
    })
  } catch (e) {
    const msg = formatD1MediaInsertFailureMessage(e)
    const stored = truncateErrorMessage(extractPipelineErrorChainMessage(e))
    await payload.logger.error({ err: stored, siteId }, 'site_logo_generate_failed')
    return Response.json(
      {
        ok: false,
        error: 'site_logo_generate_failed',
        message: msg,
        siteId,
        detail: stored,
      },
      { status: 502 },
    )
  }
}
