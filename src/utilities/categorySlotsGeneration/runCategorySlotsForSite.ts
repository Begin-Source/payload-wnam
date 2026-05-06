import type { Payload } from 'payload'

import { openrouterChatWithMeta } from '@/services/integrations/openrouter/chat'
import { recordOpenRouterAiCost } from '@/utilities/aiCostLog'
import type { Site } from '@/payload-types'
import { checkPipelineSpendForJob, incrementSiteQuotaUsage } from '@/utilities/siteQuotaCheck'
import { parseRelationshipId } from '@/utilities/parseRelationshipId'
import { normalizeSitePublicLocales } from '@/utilities/sitePublicLocales'

import { resolveCategorySlotsShortnamePrompts } from './resolveCategorySlotsPrompts'
import { mergeBuildCategories, normalizeReadyRows } from './buildCategories'
import { gateByForceAndExisting, type GateInputRow } from './gate'
import { parseAiShortnameResponse } from './parseAiShortname'
import {
  siteTenantIdForCategorySync,
  syncCategorySlotsWorkflowToCategories,
} from './syncCategorySlotsWorkflow'

function resolveSlotLocale(site: Site, explicit?: string | null): string {
  const { defaultPublicLocale } = normalizeSitePublicLocales(site)
  const t = typeof explicit === 'string' ? explicit.trim() : ''
  return t || defaultPublicLocale
}

const JOB_TYPE = 'category_slots'
const OPENROUTER_EST_USD = 0.03

function slugify(term: string): string {
  return term
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]/gi, '')
    .slice(0, 120)
}

async function markCategorySlotsWorkflowErrorForSite(
  payload: Payload,
  siteId: number,
  locale?: string | null,
): Promise<void> {
  try {
    const tenantId = await siteTenantIdForCategorySync(payload, siteId)
    if (tenantId == null) return
    await syncCategorySlotsWorkflowToCategories(payload, siteId, 'error', tenantId, locale)
  } catch {
    /* best-effort */
  }
}

async function uniqueSlugForSiteLocale(
  payload: Payload,
  siteId: number,
  locale: string,
  baseSlug: string,
  excludeCategoryId?: number,
): Promise<string> {
  const r = await payload.find({
    collection: 'categories',
    where: {
      and: [{ site: { equals: siteId } }, { locale: { equals: locale } }],
    },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  const slugs = new Set(
    r.docs
      .filter((d) => (d as { id: number }).id !== excludeCategoryId)
      .map((d) => String((d as { slug?: string }).slug ?? ''))
      .filter(Boolean),
  )
  const base = baseSlug || `category-${Date.now()}`
  let candidate = base
  let n = 2
  while (slugs.has(candidate)) {
    candidate = `${base}-${n}`
    n += 1
  }
  return candidate
}

async function upsertSlotCategories(
  payload: Payload,
  siteId: number,
  categoryNames: string[],
  siteTenantId: number,
  locale: string,
): Promise<void> {
  for (let i = 1; i <= 5; i += 1) {
    const name =
      String(categoryNames[i - 1] ?? '').trim() ||
      `Product Category ${i}`

    const found = await payload.find({
      collection: 'categories',
      where: {
        and: [
          { site: { equals: siteId } },
          { slotIndex: { equals: i } },
          { locale: { equals: locale } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    const existing = found.docs[0] as { id: number } | undefined
    const baseSlug = slugify(name)
    const slug = await uniqueSlugForSiteLocale(payload, siteId, locale, baseSlug, existing?.id)

    if (existing) {
      await payload.update({
        collection: 'categories',
        id: existing.id,
        data: { name, slug, slotIndex: i, tenant: siteTenantId, locale },
        overrideAccess: true,
      })
    } else {
      await payload.create({
        collection: 'categories',
        data: {
          name,
          slug,
          site: siteId,
          slotIndex: i,
          tenant: siteTenantId,
          locale,
        },
        overrideAccess: true,
      })
    }
  }
}

function nicheTargetAudience(site: Site): string {
  const nd = site.nicheData
  if (nd && typeof nd === 'object' && !Array.isArray(nd)) {
    const o = nd as Record<string, unknown>
    return String(o.target_audience ?? o.targetAudience ?? o.audience ?? '')
      .replace(/\s+/g, ' ')
      .trim()
  }
  return ''
}

export type RunCategorySlotsArgs = {
  payload: Payload
  siteId: number
  /** Defaults to site `defaultPublicLocale`. */
  locale?: string | null
  mainProductOverride?: string | null
  force?: boolean
  aiModel?: string | null
  afterPrepare?: boolean
}

export type RunCategorySlotsResult =
  | { ok: true; siteId: number }
  | { ok: false; code: string; message: string; status: number }

function resolveMainProduct(site: Site, override?: string | null): string | null {
  const from =
    (typeof override === 'string' && override.trim() ? override.trim() : null) ??
    (typeof site.mainProduct === 'string' && site.mainProduct.trim()
      ? site.mainProduct.trim()
      : '')
  return from || null
}

async function loadContext(args: RunCategorySlotsArgs): Promise<
  | RunCategorySlotsResult
  | {
      ok: true
      site: Site
      siteTenantId: number
      mainProduct: string
      gateInput: GateInputRow[]
      needAi: boolean
      readyRows: Awaited<ReturnType<typeof gateByForceAndExisting>>['ready_rows']
      toGenerate: GateInputRow[]
    }
> {
  const { payload, siteId, force } = args
  const site = (await payload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 0,
  })) as Site | null

  if (!site) {
    return { ok: false, code: 'SITE_NOT_FOUND', message: '站点不存在', status: 404 }
  }

  const siteTenantId = parseRelationshipId(site.tenant)
  if (siteTenantId == null) {
    return {
      ok: false,
      code: 'SITE_TENANT_REQUIRED',
      message: '请为该站点分配租户（Assigned Tenant）后再生成分类槽位。',
      status: 400,
    }
  }

  const mainProduct = resolveMainProduct(site, args.mainProductOverride)
  if (!mainProduct) {
    return {
      ok: false,
      code: 'MAIN_PRODUCT_REQUIRED',
      message: '请填写主产品，或在站点上保存「主品 / Main product」后再试。',
      status: 400,
    }
  }

  const slotLocaleGate = resolveSlotLocale(site, args.locale)

  const gateInput: GateInputRow[] = [
    {
      id: String(siteId),
      site_id: siteId,
      main_product: mainProduct,
      force: !!force,
      site_name: String(site.name ?? '').trim(),
      target_audience: nicheTargetAudience(site),
    },
  ]

  const { ready_rows, to_generate_rows } = await gateByForceAndExisting(
    payload,
    gateInput,
    slotLocaleGate,
  )
  const needAi = to_generate_rows.length > 0

  return {
    ok: true,
    site,
    siteTenantId,
    mainProduct,
    gateInput,
    needAi,
    readyRows: ready_rows,
    toGenerate: to_generate_rows,
  }
}

export async function prepareCategorySlotsForSite(
  args: RunCategorySlotsArgs,
): Promise<RunCategorySlotsResult> {
  const ctx = await loadContext(args)
  if (!ctx.ok) return ctx

  if (ctx.needAi) {
    const spend = await checkPipelineSpendForJob(args.payload, args.siteId, JOB_TYPE)
    if (!spend.ok) {
      return { ok: false, code: 'QUOTA', message: spend.message, status: 402 }
    }
  }

  const slotLocale = resolveSlotLocale(ctx.site, args.locale)

  try {
    await syncCategorySlotsWorkflowToCategories(
      args.payload,
      args.siteId,
      'running',
      ctx.siteTenantId,
      slotLocale,
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      code: 'PREPARE',
      message: msg || '无法将分类槽位标为运行中',
      status: 500,
    }
  }

  return { ok: true, siteId: args.siteId }
}

export async function runCategorySlotsForSite(
  args: RunCategorySlotsArgs,
): Promise<RunCategorySlotsResult> {
  const { payload, siteId, afterPrepare } = args
  const ctx = await loadContext(args)
  if (!ctx.ok) {
    if (afterPrepare) await markCategorySlotsWorkflowErrorForSite(payload, siteId, args.locale)
    return ctx
  }

  const slotLocale = resolveSlotLocale(ctx.site, args.locale)

  if (!ctx.needAi) {
    try {
      await syncCategorySlotsWorkflowToCategories(
        payload,
        siteId,
        'done',
        ctx.siteTenantId,
        slotLocale,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, code: 'UPDATE', message: msg, status: 500 }
    }
    return { ok: true, siteId }
  }

  if (!afterPrepare) {
    await syncCategorySlotsWorkflowToCategories(
      payload,
      siteId,
      'running',
      ctx.siteTenantId,
      slotLocale,
    )
  }

  const aiModel =
    typeof args.aiModel === 'string' && args.aiModel.trim()
      ? args.aiModel.trim()
      : 'google/gemini-2.5-flash'

  const { systemPrompt, userPrompt } = await resolveCategorySlotsShortnamePrompts(
    payload,
    ctx.siteTenantId,
    ctx.toGenerate,
  )
  let raw: string
  try {
    const cs = await openrouterChatWithMeta(
      aiModel,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { responseFormatJson: true, temperature: 0.7 },
    )
    raw = cs.text
    try {
      await recordOpenRouterAiCost({
        payload,
        target: { collection: 'sites', id: siteId },
        model: aiModel,
        usage: cs.usage,
        raw: cs.raw,
        kind: 'category_slots',
      })
    } catch {
      /* optional ledger */
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await markCategorySlotsWorkflowErrorForSite(payload, siteId, slotLocale)
    return { ok: false, code: 'OPENROUTER', message: msg, status: 502 }
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw) as unknown
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await markCategorySlotsWorkflowErrorForSite(payload, siteId, slotLocale)
    return { ok: false, code: 'PARSE', message: msg, status: 422 }
  }

  const enriched = parseAiShortnameResponse(ctx.toGenerate, parsedJson)
  const readyNorm = normalizeReadyRows(ctx.readyRows)
  const merged = mergeBuildCategories(readyNorm, enriched)
  const row = merged[0]
  if (!row || !Array.isArray(row.categories)) {
    await markCategorySlotsWorkflowErrorForSite(payload, siteId, slotLocale)
    return {
      ok: false,
      code: 'BUILD',
      message: '未能生成类目槽位数据',
      status: 500,
    }
  }

  try {
    await upsertSlotCategories(payload, siteId, row.categories, ctx.siteTenantId, slotLocale)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await markCategorySlotsWorkflowErrorForSite(payload, siteId, slotLocale)
    return { ok: false, code: 'UPSERT', message: msg, status: 500 }
  }

  try {
    await syncCategorySlotsWorkflowToCategories(
      payload,
      siteId,
      'done',
      ctx.siteTenantId,
      slotLocale,
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, code: 'UPDATE', message: msg, status: 500 }
  }

  await incrementSiteQuotaUsage(payload, siteId, { openrouterUsd: OPENROUTER_EST_USD })

  return { ok: true, siteId }
}
