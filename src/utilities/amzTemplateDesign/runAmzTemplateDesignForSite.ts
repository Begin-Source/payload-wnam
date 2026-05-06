import type { Payload } from 'payload'

import type { AmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import {
  mergeAmzSiteConfigFromRaw,
  mergePatchOntoAmzConfig,
} from '@/site-layouts/amz-template-1/mergeAmzSiteConfig'
import { openrouterChatWithMeta } from '@/services/integrations/openrouter/chat'
import { recordOpenRouterAiCost } from '@/utilities/aiCostLog'
import {
  AMZ_DESIGN_FILLABLE_DOT_PATHS,
  applyAllowedFillPatches,
  buildFlatFillSkeletonPlaceholderJson,
  parseFillSlotsPatch,
} from '@/utilities/amzTemplateDesign/amzDesignFillablePaths'
import { coerceBrandLogoLucideForNiche } from '@/utilities/amzNicheLucideIcon'
import { parseRelationshipId } from '@/utilities/parseRelationshipId'
import {
  AMZ_TEMPLATE_DESIGN_FILL_SYSTEM,
  AMZ_TEMPLATE_DESIGN_FILL_USER,
  AMZ_TEMPLATE_DESIGN_MERGE_SYSTEM,
  AMZ_TEMPLATE_DESIGN_MERGE_USER,
} from '@/utilities/domainGeneration/promptKeys'
import {
  buildAmzTemplateDesignFillPromptDefaults,
  buildAmzTemplateDesignFillPromptVars,
  buildAmzTemplateDesignMergePromptDefaults,
  buildAmzTemplateDesignMergePromptVars,
} from '@/utilities/openRouterTenantPrompts/defaultOpenRouterTenantPromptBodies'
import { resolveTenantPromptPair } from '@/utilities/openRouterTenantPrompts/loadTenantPromptTemplateBody'
import {
  checkPipelineSpendForJob,
  incrementSiteQuotaUsage,
} from '@/utilities/siteQuotaCheck'
import { tenantIdFromRelation } from '@/utilities/tenantScope'
import type { Site, SiteBlueprint } from '@/payload-types'

const MAX_CURRENT_JSON_CHARS = 120_000
const MAX_DESIGN_WORKFLOW_ERROR_DETAIL_CHARS = 8000
/** Total stored log size; older entries dropped from the start when exceeded. */
const MAX_DESIGN_WORKFLOW_LOG_CHARS = 32_000
const OPENROUTER_EST_USD = 0.06

/** Clear last-error fields when (re)starting or finishing the design workflow. */
const clearedDesignWorkflowLastError = {
  designWorkflowLastErrorCode: null as string | null,
  designWorkflowLastErrorDetail: null as string | null,
  designWorkflowLastErrorAt: null as string | null,
}

function canonicalDomain(primary: string | null | undefined): string {
  return String(primary ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
}

function stripMarkdownFences(text: string): string {
  let s = text.trim()
  s = s.replace(/^```(?:json)?\s*\n?/i, '')
  s = s.replace(/\n?```\s*$/i, '')
  return s.trim()
}

function parseJsonPatch(raw: string): unknown {
  const s = stripMarkdownFences(raw)
  try {
    return JSON.parse(s) as unknown
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`AI 返回非合法 JSON: ${msg}`)
  }
}

/** After AI merge, restore slices that must stay identical to pre-merge (n8n workflow rules). */
function reapplyLockedSlices(base: AmzSiteConfig, draft: AmzSiteConfig): AmzSiteConfig {
  const out = structuredClone(draft) as unknown as Record<string, unknown>
  const b = base as unknown as Record<string, unknown>

  const nav = out.navigation as Record<string, unknown> | undefined
  const bNav = b.navigation as Record<string, unknown> | undefined
  if (nav && bNav && Array.isArray(bNav.main)) {
    out.navigation = { ...nav, main: bNav.main }
  }

  const hp = out.homepage as Record<string, unknown> | undefined
  const bHp = b.homepage as unknown as Record<string, unknown> | undefined
  if (hp && bHp) {
    const cat = hp.categories as Record<string, unknown> | undefined
    const bCat = bHp.categories as Record<string, unknown> | undefined
    if (cat && bCat && bCat.items !== undefined) {
      hp.categories = { ...cat, items: bCat.items }
      out.homepage = { ...hp }
    }
  }

  const pages = out.pages as Record<string, unknown> | undefined
  const bPages = b.pages as Record<string, unknown> | undefined
  if (pages && bPages) {
    const g = pages.guides as Record<string, unknown> | undefined
    const bg = bPages.guides as Record<string, unknown> | undefined
    if (g && bg && bg.categories !== undefined) {
      pages.guides = { ...g, categories: bg.categories }
      out.pages = { ...pages }
    }
  }

  const foot = out.footer as Record<string, unknown> | undefined
  const bFoot = b.footer as Record<string, unknown> | undefined
  if (foot && bFoot) {
    out.footer = {
      ...foot,
      resources: bFoot.resources,
      legal: bFoot.legal,
    }
  }

  return out as AmzSiteConfig
}

function enforceCanonicalIdentity(
  siteName: string,
  domain: string,
  c: AmzSiteConfig,
): void {
  const name = siteName.trim()
  if (name && c.brand && typeof c.brand === 'object') {
    ;(c.brand as { name?: string }).name = name
  }
  if (domain && c.seo && typeof c.seo === 'object') {
    ;(c.seo as { siteUrl?: string }).siteUrl = `https://${domain}`
  }
}

export function buildSystemPrompt(fillSlots: boolean): string {
  const head: string[] = [
    'You are an expert web developer and SEO specialist. You output JSON only (no markdown, no prose).',
    fillSlots
      ? 'You are in FILL-SLOTS mode: the user lists exact dot-path keys. Output a single flat JSON object whose keys are only those paths. Values must be strings: English copy for content keys; literal oklch(L C H) for theme.colors.* keys; plain font stack names for fonts.sans / fonts.mono. Do not nest objects under top-level keys. Do not add keys not listed. Do not output arrays.'
      : 'The JSON will be deep-merged into an existing AMZ siteConfig object (Payload CMS) used by amz-template-1 and amz-template-2.',
  ]

  const rules = fillSlots
    ? [
        'Rules (fill-slots):',
        '1) English copy paths: original prose for niche + main product; vary wording when variation_seed changes. Theme paths: coherent oklch(L C H) palettes + readable contrast (see readability bullets). Fonts: legible stacks matching niche.',
        '2) Each key must match the user-listed dot-path; values non-empty strings. theme.colors.* must match oklch(...) syntax.',
        '3) Brand logo and locks: do not emit brand.logo*, navigation.main, footer.resources, footer.legal, homepage.categories.items, or pages.guides.categories.',
        '4) Readability: light mode — foreground L must stay clearly darker than background L when background is near-white; mutedForeground readable on muted. Dark mode — foreground clearly lighter than background. Never near-equal L between body text and its surface.',
        '5) Niche harmony: derive hue/chroma tendencies from niche + main product so primary/accent relate to vertical (avoid random unrelated hues).',
        '6) Invalid JSON or wrong value types rejected — valid JSON object only.',
      ]
    : [
        'Rules:',
        '1) ALL user-visible copy you add or change must be in English only.',
        '2) pages.guides: you MAY change title, description, and cta (cta.title, cta.description, cta.primaryButton.text). Keep cta.primaryButton.href as /reviews unless a clearly better internal path exists. Do NOT change pages.guides.categories — the server will restore it; omit "categories" from your output.',
        '3) Do NOT include navigation.main in your output — server locks it.',
        '4) Do NOT include footer.resources or footer.legal — server locks them.',
        '5) Do NOT include homepage.categories.items — server locks it.',
        '6) Update brand, SEO, hero, homepage copy (except locked category items), pages (except guides.categories), footer.about text, copyright, affiliateNotice, etc. to match main product + niche.',
        '7) Theme (theme.colors.light / theme.colors.dark): use oklch(L C H) strings matching the schema. Align hue (H) and chroma (C) with niche + main product (examples: wellness → natural greens or soft teal; electronics → restrained cool neutrals + cool accent; gourmet → warm neutrals + food-friendly accent). Light and dark themes should feel like one brand.',
        '8) Readability: never produce low-contrast body text — if background/card is light, foreground must use clearly darker OKLCH L than the surface; if background is dark, foreground must be clearly lighter. Avoid similar L between body text and page background or card. mutedForeground must stay readable on muted/background fills. Accent/primary fills must pair with legible on-button text in typical AMZ shell usage.',
        '9) Fonts (fonts.sans, fonts.mono): choose common web-safe stacks or CDN-friendly names suited to niche; sans for UI/body, mono sparingly; prioritize legibility over display novelty.',
        '10) Only use keys that exist in typical siteConfig shape; prefer partial objects for deep merge.',
        '11) Canonical identity: brand.name must equal canonical_site_name when non-empty; seo.siteUrl must be https://<canonical_site_domain> when domain non-empty — server enforces after merge.',
        '12) Brand logo (header + favicon): include brand.logo. Unless you deliberately use an uploaded raster mark, brand.logo.type must be "lucide". brand.logo.icon must be a real lucide-react PascalCase export (https://lucide.dev/icons/) semantically aligned with Main product + niche JSON — never a meaningless token.',
        '    Forbidden generic placeholders for icon: Image, Globe, Circle, Box. When uncertain, prefer a broader vertical icon (for example Activity for fitness/wellness) instead of Image.',
        '13) Return a single JSON object.',
      ]

  return [...head, '', ...rules].join('\n')
}

export function buildUserPrompt(args: {
  mainProduct: string
  canonicalSiteName: string
  canonicalSiteDomain: string
  nicheJson: string
  currentConfigJson: string
}): string {
  return [
    'Main product: ' + args.mainProduct,
    'Canonical site_name: ' + (args.canonicalSiteName || '(empty)'),
    'Canonical site_domain: ' + (args.canonicalSiteDomain || '(empty)'),
    '',
    'Niche data: ' + args.nicheJson,
    '',
    'Current merged siteConfig (JSON):\n' + args.currentConfigJson,
    '',
    'Produce the JSON patch/object to merge. Respect locked lists (omit navigation.main, footer.resources, footer.legal, homepage.categories.items, pages.guides.categories). English copy only.',
    'For brand.logo: use type "lucide" unless providing a deliberate raster logo; set icon to one specific PascalCase Lucide name that reflects the niche and Main product stated above.',
  ].join('\n')
}

export function buildFillSlotsUserPrompt(args: {
  mainProduct: string
  canonicalSiteName: string
  canonicalSiteDomain: string
  nicheJson: string
  variationSeed: string
}): string {
  const skeleton = JSON.stringify(buildFlatFillSkeletonPlaceholderJson(), null, 2)
  return [
    'Mode: FILL-SLOTS (English copy only on whitelisted paths).',
    'Main product: ' + args.mainProduct,
    'Canonical site_name: ' + (args.canonicalSiteName || '(empty)'),
    'Canonical site_domain: ' + (args.canonicalSiteDomain || '(empty)'),
    'variation_seed: ' + args.variationSeed,
    '',
    'Niche data: ' + args.nicheJson,
    '',
    'Fill every field below. Output one flat JSON object: keys must be exactly these dot-paths, values real English strings (no __FILL_EN__).',
    'Do not send the full siteConfig; do not nest objects at the top level.',
    '',
    'Allowed dot-path keys (' + String(AMZ_DESIGN_FILLABLE_DOT_PATHS.length) + '):',
    AMZ_DESIGN_FILLABLE_DOT_PATHS.join('\n'),
    '',
    'Shape reference (values are placeholders only):',
    skeleton,
  ].join('\n')
}

export type RunAmzTemplateDesignForBlueprintArgs = {
  payload: Payload
  blueprintId: number
  mainProductOverride?: string | null
  aiModel?: string | null
  /** Flat copy-only regen (whitelist dot-paths); does not send full merged config */
  fillSlots?: boolean | null
  /** Set when client already called prepare — designWorkflowStatus is already running. */
  afterPrepare?: boolean
}

export type RunAmzTemplateDesignResult =
  | { ok: true; blueprintId: number }
  | { ok: false; code: string; message: string; status: number }

type AmzDesignWorkContext = {
  blueprint: SiteBlueprint
  site: Site
  siteId: number
  blueprintId: number
  mainProduct: string
  aiModel: string
  current: AmzSiteConfig
  canonicalSiteName: string
  canonicalSiteDomain: string
  fillSlots: boolean
  variationSeed: string
  nicheJson: string
  currentConfigJson: string
}

async function markBlueprintDesignWorkflowError(
  payload: Payload,
  blueprintId: number,
  err?: { code?: string; message?: string },
): Promise<void> {
  try {
    const atIso = new Date().toISOString()
    const code = err?.code?.trim() || null
    let detail = err?.message?.trim() || null
    if (detail && detail.length > MAX_DESIGN_WORKFLOW_ERROR_DETAIL_CHARS) {
      detail =
        detail.slice(0, MAX_DESIGN_WORKFLOW_ERROR_DETAIL_CHARS) + '\n…(truncated)'
    }

    const existing = (await payload.findByID({
      collection: 'site-blueprints',
      id: blueprintId,
      depth: 0,
    })) as SiteBlueprint | null
    const rawPrev = existing?.designWorkflowLog
    const prevLog =
      typeof rawPrev === 'string' && rawPrev.trim() ? rawPrev : ''
    const logLine = [
      `${atIso} [${code?.trim() || 'ERROR'}]`,
      detail ?? '',
      '',
    ].join('\n')
    let designWorkflowLog = (prevLog ? `${prevLog}\n` : '') + logLine
    if (designWorkflowLog.length > MAX_DESIGN_WORKFLOW_LOG_CHARS) {
      const note = '…(earlier log truncated)\n\n'
      designWorkflowLog =
        note + designWorkflowLog.slice(-(MAX_DESIGN_WORKFLOW_LOG_CHARS - note.length))
    }

    await payload.update({
      collection: 'site-blueprints',
      id: blueprintId,
      data: {
        designWorkflowStatus: 'error',
        designWorkflowLastErrorCode: code,
        designWorkflowLastErrorDetail: detail,
        designWorkflowLastErrorAt: atIso,
        designWorkflowLog,
      },
      overrideAccess: true,
    })
  } catch {
    /* best-effort */
  }
}

async function loadAmzTemplateDesignWorkContext(
  args: RunAmzTemplateDesignForBlueprintArgs,
): Promise<RunAmzTemplateDesignResult | { ok: true; ctx: AmzDesignWorkContext }> {
  const { payload, blueprintId } = args
  const aiModel =
    typeof args.aiModel === 'string' && args.aiModel.trim()
      ? args.aiModel.trim()
      : 'google/gemini-2.5-flash'

  const blueprint = (await payload.findByID({
    collection: 'site-blueprints',
    id: blueprintId,
    depth: 0,
  })) as SiteBlueprint | null

  if (!blueprint) {
    return { ok: false, code: 'BLUEPRINT_NOT_FOUND', message: '设计文档不存在', status: 404 }
  }

  const siteId = parseRelationshipId(blueprint.site)
  if (siteId == null) {
    return {
      ok: false,
      code: 'NO_SITE_ON_BLUEPRINT',
      message: '请先在「设计」上选择「站点」。',
      status: 400,
    }
  }

  const site = (await payload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 0,
  })) as Site | null

  if (!site) {
    return { ok: false, code: 'SITE_NOT_FOUND', message: '站点不存在', status: 404 }
  }

  if (site.siteLayout !== 'amz-template-1' && site.siteLayout !== 'amz-template-2') {
    return {
      ok: false,
      code: 'NOT_AMZ_LAYOUT',
      message:
        '仅支持「站点布局」为 amz-template-1 或 amz-template-2 的站点；请先在站点中切换布局并保存。',
      status: 400,
    }
  }

  const spend = await checkPipelineSpendForJob(payload, siteId, 'amz_template_design')
  if (!spend.ok) {
    return { ok: false, code: 'QUOTA', message: spend.message, status: 402 }
  }

  const mainProduct =
    (typeof args.mainProductOverride === 'string' && args.mainProductOverride.trim()
      ? args.mainProductOverride.trim()
      : null) ??
    (typeof site.mainProduct === 'string' && site.mainProduct.trim()
      ? site.mainProduct.trim()
      : '')

  if (!mainProduct) {
    return {
      ok: false,
      code: 'MAIN_PRODUCT_REQUIRED',
      message: '请填写主产品，或在站点上保存「主品 / Main product」后再试。',
      status: 400,
    }
  }

  const current = mergeAmzSiteConfigFromRaw(blueprint.amzSiteConfigJson)
  let currentJson = JSON.stringify(current, null, 2)
  if (currentJson.length > MAX_CURRENT_JSON_CHARS) {
    currentJson = currentJson.slice(0, MAX_CURRENT_JSON_CHARS) + '\n…(truncated)'
  }

  const canonicalSiteName = String(site.name ?? '').trim()
  const canonicalSiteDomain = canonicalDomain(site.primaryDomain)

  let niche: Record<string, unknown> = {}
  const nd = site.nicheData
  if (nd && typeof nd === 'object' && !Array.isArray(nd)) {
    niche = nd as Record<string, unknown>
  }

  const nicheJson = JSON.stringify(niche)
  const fillSlots = Boolean(args.fillSlots)
  const variationSeed = `${blueprintId}-${Date.now()}`

  return {
    ok: true,
    ctx: {
      blueprint,
      site,
      siteId,
      blueprintId,
      mainProduct,
      aiModel,
      current,
      canonicalSiteName,
      canonicalSiteDomain,
      fillSlots,
      variationSeed,
      nicheJson,
      currentConfigJson: currentJson,
    },
  }
}

/** Validate + mark designWorkflowStatus running (for immediate modal close + background job). */
export async function prepareAmzTemplateDesignForBlueprint(
  args: RunAmzTemplateDesignForBlueprintArgs,
): Promise<RunAmzTemplateDesignResult> {
  const loaded = await loadAmzTemplateDesignWorkContext(args)
  if (!loaded.ok) return loaded

  try {
    await args.payload.update({
      collection: 'site-blueprints',
      id: args.blueprintId,
      data: {
        designWorkflowStatus: 'running',
        ...clearedDesignWorkflowLastError,
      },
      overrideAccess: true,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      code: 'PREPARE',
      message: msg || '无法将设计标为运行中',
      status: 500,
    }
  }

  return { ok: true, blueprintId: args.blueprintId }
}

export async function runAmzTemplateDesignForBlueprint(
  args: RunAmzTemplateDesignForBlueprintArgs,
): Promise<RunAmzTemplateDesignResult> {
  const { payload, blueprintId, afterPrepare } = args
  const loaded = await loadAmzTemplateDesignWorkContext(args)
  if (!loaded.ok) {
    if (afterPrepare) {
      await markBlueprintDesignWorkflowError(payload, blueprintId, {
        code: loaded.code,
        message: loaded.message,
      })
    }
    return loaded
  }

  const { ctx } = loaded

  if (!afterPrepare) {
    await payload.update({
      collection: 'site-blueprints',
      id: blueprintId,
      data: {
        designWorkflowStatus: 'running',
        ...clearedDesignWorkflowLastError,
      },
      overrideAccess: true,
    })
  }

  let raw: string
  let amzChatUsage:
    | {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
      }
    | undefined
  let amzChatRaw: unknown
  try {
    const tenantId = tenantIdFromRelation(ctx.site.tenant)
    let system: string
    let user: string
    if (ctx.fillSlots) {
      const fillVars = buildAmzTemplateDesignFillPromptVars({
        mainProduct: ctx.mainProduct,
        canonicalSiteName: ctx.canonicalSiteName,
        canonicalSiteDomain: ctx.canonicalSiteDomain,
        nicheJson: ctx.nicheJson,
        variationSeed: ctx.variationSeed,
      })
      const defaults = buildAmzTemplateDesignFillPromptDefaults({
        mainProduct: ctx.mainProduct,
        canonicalSiteName: ctx.canonicalSiteName,
        canonicalSiteDomain: ctx.canonicalSiteDomain,
        nicheJson: ctx.nicheJson,
        variationSeed: ctx.variationSeed,
      })
      const r = await resolveTenantPromptPair(
        payload,
        tenantId,
        AMZ_TEMPLATE_DESIGN_FILL_SYSTEM,
        AMZ_TEMPLATE_DESIGN_FILL_USER,
        defaults,
        fillVars,
      )
      system = r.system
      user = r.user
    } else {
      const mergeVars = buildAmzTemplateDesignMergePromptVars({
        mainProduct: ctx.mainProduct,
        canonicalSiteName: ctx.canonicalSiteName,
        canonicalSiteDomain: ctx.canonicalSiteDomain,
        nicheJson: ctx.nicheJson,
        currentConfigJson: ctx.currentConfigJson,
      })
      const defaults = buildAmzTemplateDesignMergePromptDefaults({
        mainProduct: ctx.mainProduct,
        canonicalSiteName: ctx.canonicalSiteName,
        canonicalSiteDomain: ctx.canonicalSiteDomain,
        nicheJson: ctx.nicheJson,
        currentConfigJson: ctx.currentConfigJson,
      })
      const r = await resolveTenantPromptPair(
        payload,
        tenantId,
        AMZ_TEMPLATE_DESIGN_MERGE_SYSTEM,
        AMZ_TEMPLATE_DESIGN_MERGE_USER,
        defaults,
        mergeVars,
      )
      system = r.system
      user = r.user
    }

    const chatOut = await openrouterChatWithMeta(
      ctx.aiModel,
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      {
        responseFormatJson: true,
        temperature: ctx.fillSlots ? 0.52 : 0.35,
      },
    )
    raw = chatOut.text
    amzChatUsage = chatOut.usage
    amzChatRaw = chatOut.raw
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await markBlueprintDesignWorkflowError(payload, blueprintId, {
      code: 'OPENROUTER',
      message: msg,
    })
    return { ok: false, code: 'OPENROUTER', message: msg, status: 502 }
  }

  try {
    await recordOpenRouterAiCost({
      payload,
      target: { collection: 'sites', id: ctx.siteId },
      model: ctx.aiModel,
      usage: amzChatUsage,
      raw: amzChatRaw,
      kind: 'amz_template_design',
    })
  } catch {
    /* optional ledger */
  }

  let patch: unknown
  try {
    patch = parseJsonPatch(raw)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await markBlueprintDesignWorkflowError(payload, blueprintId, {
      code: 'PARSE',
      message: msg,
    })
    return { ok: false, code: 'PARSE', message: msg, status: 422 }
  }

  let merged: AmzSiteConfig
  if (ctx.fillSlots) {
    const flat = parseFillSlotsPatch(patch)
    const draft = structuredClone(ctx.current)
    const wrote = applyAllowedFillPatches(draft, flat)
    if (wrote === 0) {
      const detail = '模型未返回任何可写入的白名单字段（或全部为空白）'
      await markBlueprintDesignWorkflowError(payload, blueprintId, {
        code: 'FILL_EMPTY',
        message: detail,
      })
      return { ok: false, code: 'FILL_EMPTY', message: detail, status: 422 }
    }
    merged = reapplyLockedSlices(ctx.current, draft)
  } else {
    merged = mergePatchOntoAmzConfig(ctx.current, patch)
    merged = reapplyLockedSlices(ctx.current, merged)
  }
  coerceBrandLogoLucideForNiche(
    merged,
    ctx.mainProduct,
    ctx.site.nicheData,
    ctx.canonicalSiteDomain,
    typeof ctx.site.slug === 'string' ? ctx.site.slug : null,
  )
  enforceCanonicalIdentity(ctx.canonicalSiteName, ctx.canonicalSiteDomain, merged)

  try {
    await payload.update({
      collection: 'site-blueprints',
      id: blueprintId,
      data: {
        amzSiteConfigJson: merged as Record<string, unknown>,
        designWorkflowStatus: 'done',
        ...clearedDesignWorkflowLastError,
      },
      overrideAccess: true,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await markBlueprintDesignWorkflowError(payload, blueprintId, {
      code: 'UPDATE',
      message: msg,
    })
    return { ok: false, code: 'UPDATE', message: msg, status: 500 }
  }

  if (
    typeof args.mainProductOverride === 'string' &&
    args.mainProductOverride.trim() &&
    args.mainProductOverride.trim() !== String(ctx.site.mainProduct ?? '').trim()
  ) {
    await payload.update({
      collection: 'sites',
      id: ctx.siteId,
      data: { mainProduct: args.mainProductOverride.trim() },
      overrideAccess: true,
    })
  }

  await incrementSiteQuotaUsage(payload, ctx.siteId, { openrouterUsd: OPENROUTER_EST_USD })

  return { ok: true, blueprintId }
}
