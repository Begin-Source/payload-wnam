import type { Payload } from 'payload'

import { openrouterChatWithMeta } from '@/services/integrations/openrouter/chat'
import type { Page, Site } from '@/payload-types'
import { emptyLexicalDocument } from '@/utilities/emptyLexical'
import {
  checkPipelineSpendForJob,
  incrementSiteQuotaUsage,
} from '@/utilities/siteQuotaCheck'
import {
  extractSitePagesBundleFromModelText,
  formatSitePagesBundleFields,
} from '@/utilities/sitePagesBundleContent/extractAndFormatSitePagesBundle'
import { markdownToPageBodyLexical } from '@/utilities/sitePagesBundleContent/markdownToPayloadLexical'
import {
  buildUserPromptForTrustPagesBundle,
  DEFAULT_TRUST_BUNDLE_MODEL,
  SYSTEM_PROMPT_TRUST_PAGES_BUNDLE,
} from '@/utilities/sitePagesBundleContent/sitePagesBundleOpenRouterPrompts'
import {
  CONTENT_KEY_BY_SLUG,
  TRUST_BUNDLE_LOCALE,
  TRUST_BUNDLE_SLUGS,
  TRUST_PAGE_TITLE,
  type TrustBundleSlug,
} from '@/utilities/sitePagesBundleContent/trustPageConstants'

const MAX_LOG = 32_000
const MAX_ERR_DETAIL = 8_000
const OPENROUTER_EST_USD = 0.05

function errorMessageWithCauses(err: unknown): string {
  if (err == null) return 'Unknown error'
  if (typeof err !== 'object' || !('message' in err) || typeof (err as Error).message !== 'string') {
    return String(err)
  }
  const parts: string[] = [(err as Error).message.trim()]
  let c: unknown = (err as Error & { cause?: unknown }).cause
  for (let d = 0; d < 5 && c instanceof Error; d += 1) {
    const m = c.message.trim()
    if (m) parts.push(m)
    c = c.cause
  }
  return parts.join(' | ') || 'Unknown error'
}

const clearedBundleLastError = {
  sitePagesBundleLastErrorCode: null as string | null,
  sitePagesBundleLastErrorDetail: null as string | null,
  sitePagesBundleLastErrorAt: null as string | null,
}

function relationIdFromSite(site: Site): number | null {
  const t = (site as { tenant?: unknown }).tenant
  if (t == null) return null
  if (typeof t === 'number' || typeof t === 'string') {
    const n = typeof t === 'number' ? t : Number(t)
    return Number.isFinite(n) ? n : null
  }
  if (typeof t === 'object' && t && 'id' in t) {
    const n = Number((t as { id: number }).id)
    return Number.isFinite(n) ? n : null
  }
  return null
}

async function getTrustPageDoc(
  payload: Payload,
  siteId: number,
  slug: TrustBundleSlug,
): Promise<Page | null> {
  const r = await payload.find({
    collection: 'pages',
    where: {
      and: [
        { site: { equals: siteId } },
        { slug: { equals: slug } },
        { locale: { equals: TRUST_BUNDLE_LOCALE } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return (r.docs[0] as Page | undefined) ?? null
}

async function findOrCreateTrustEnPage(
  payload: Payload,
  site: Site,
  siteId: number,
  slug: TrustBundleSlug,
): Promise<Page> {
  const existing = await getTrustPageDoc(payload, siteId, slug)
  if (existing) return existing
  const tenantId = relationIdFromSite(site)
  const data: Record<string, unknown> = {
    title: TRUST_PAGE_TITLE[slug],
    slug,
    locale: TRUST_BUNDLE_LOCALE,
    site: siteId,
    status: 'published' as const,
    publishedAt: new Date().toISOString(),
    body: emptyLexicalDocument() as Page['body'],
  }
  if (tenantId != null) data.tenant = tenantId
  try {
    const created = await payload.create({
      collection: 'pages',
      data: data as never,
      overrideAccess: true,
    })
    return created as Page
  } catch (e) {
    const again = await getTrustPageDoc(payload, siteId, slug)
    if (again) return again
    throw e
  }
}

async function listTrustEnPages(
  payload: Payload,
  site: Site,
  siteId: number,
): Promise<Page[]> {
  const out: Page[] = []
  for (const slug of TRUST_BUNDLE_SLUGS) {
    out.push(await findOrCreateTrustEnPage(payload, site, siteId, slug))
  }
  return out
}

async function applyToAllTrustPages(
  payload: Payload,
  siteId: number,
  data: Record<string, unknown>,
): Promise<void> {
  for (const slug of TRUST_BUNDLE_SLUGS) {
    const p = await getTrustPageDoc(payload, siteId, slug)
    if (!p) continue
    await payload.update({
      collection: 'pages',
      id: p.id,
      data: data as never,
      overrideAccess: true,
    })
  }
}

async function markBundleError(
  payload: Payload,
  siteId: number,
  err: { code?: string; message?: string },
): Promise<void> {
  const atIso = new Date().toISOString()
  const code = err.code?.trim() || null
  let detail = err.message?.trim() || null
  if (detail && detail.length > MAX_ERR_DETAIL) {
    detail = detail.slice(0, MAX_ERR_DETAIL) + '\n…(truncated)'
  }
  const about = await getTrustPageDoc(payload, siteId, 'about')
  const prevLog =
    about &&
    typeof about.sitePagesBundleWorkflowLog === 'string' &&
    about.sitePagesBundleWorkflowLog.trim()
      ? about.sitePagesBundleWorkflowLog
      : ''
  const logLine = [`${atIso} [${code || 'ERROR'}]`, detail ?? '', ''].join('\n')
  let sitePagesBundleWorkflowLog = (prevLog ? `${prevLog}\n` : '') + logLine
  if (sitePagesBundleWorkflowLog.length > MAX_LOG) {
    const note = '…(earlier log truncated)\n\n'
    sitePagesBundleWorkflowLog =
      note + sitePagesBundleWorkflowLog.slice(-(MAX_LOG - note.length))
  }
  await applyToAllTrustPages(payload, siteId, {
    sitePagesBundleWorkflowStatus: 'error',
    sitePagesBundleLastErrorCode: code,
    sitePagesBundleLastErrorDetail: detail,
    sitePagesBundleLastErrorAt: atIso,
    sitePagesBundleWorkflowLog,
  })
}

export type RunSitePagesBundleArgs = {
  payload: Payload
  siteId: number
  aiModel?: string | null
  afterPrepare?: boolean
}

export type RunSitePagesBundleResult =
  | { ok: true; siteId: number }
  | { ok: false; code: string; message: string; status: number }

export async function prepareSitePagesBundleForSite(
  args: RunSitePagesBundleArgs,
): Promise<RunSitePagesBundleResult> {
  const { payload, siteId } = args
  const site = (await payload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 0,
  })) as Site | null
  if (!site) {
    return { ok: false, code: 'SITE_NOT_FOUND', message: '站点不存在', status: 404 }
  }
  const spend = await checkPipelineSpendForJob(payload, siteId, 'site_pages_bundle_content')
  if (!spend.ok) {
    return { ok: false, code: 'QUOTA', message: spend.message, status: 402 }
  }
  try {
    await listTrustEnPages(payload, site, siteId)
  } catch (e) {
    return { ok: false, code: 'PAGES', message: errorMessageWithCauses(e), status: 500 }
  }
  await applyToAllTrustPages(payload, siteId, {
    sitePagesBundleWorkflowStatus: 'running',
    ...clearedBundleLastError,
  })
  return { ok: true, siteId }
}

export async function runSitePagesBundleContentForSite(
  args: RunSitePagesBundleArgs,
): Promise<RunSitePagesBundleResult> {
  const { payload, siteId, afterPrepare } = args
  const site = (await payload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 0,
  })) as Site | null
  if (!site) {
    return { ok: false, code: 'SITE_NOT_FOUND', message: '站点不存在', status: 404 }
  }

  const spend = await checkPipelineSpendForJob(payload, siteId, 'site_pages_bundle_content')
  if (!spend.ok) {
    if (afterPrepare) {
      await markBundleError(payload, siteId, { code: 'QUOTA', message: spend.message })
    }
    return { ok: false, code: 'QUOTA', message: spend.message, status: 402 }
  }

  let trustPages: Page[]
  try {
    trustPages = await listTrustEnPages(payload, site, siteId)
  } catch (e) {
    const msg = errorMessageWithCauses(e)
    if (afterPrepare) {
      await markBundleError(payload, siteId, { code: 'PAGES', message: msg })
    }
    return { ok: false, code: 'PAGES', message: msg, status: 500 }
  }

  if (!afterPrepare) {
    await applyToAllTrustPages(payload, siteId, {
      sitePagesBundleWorkflowStatus: 'running',
      ...clearedBundleLastError,
    })
  }

  const model =
    typeof args.aiModel === 'string' && args.aiModel.trim()
      ? args.aiModel.trim()
      : DEFAULT_TRUST_BUNDLE_MODEL

  let raw: string
  let finishReason: string
  try {
    const r = await openrouterChatWithMeta(
      model,
      [
        { role: 'system', content: SYSTEM_PROMPT_TRUST_PAGES_BUNDLE },
        { role: 'user', content: buildUserPromptForTrustPagesBundle(site) },
      ],
      { responseFormatJson: true, temperature: 0.3, maxTokens: 6144 },
    )
    raw = r.text
    finishReason = r.finishReason
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await markBundleError(payload, siteId, { code: 'OPENROUTER', message: msg })
    return { ok: false, code: 'OPENROUTER', message: msg, status: 502 }
  }

  let extracted: ReturnType<typeof extractSitePagesBundleFromModelText>
  try {
    extracted = extractSitePagesBundleFromModelText(site, raw, finishReason)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await markBundleError(payload, siteId, { code: 'EXTRACT', message: msg })
    return { ok: false, code: 'EXTRACT', message: msg, status: 422 }
  }

  const formatted = formatSitePagesBundleFields(extracted)

  const doneData = {
    sitePagesBundleWorkflowStatus: 'done' as const,
    ...clearedBundleLastError,
  }

  for (const slug of TRUST_BUNDLE_SLUGS) {
    const key = CONTENT_KEY_BY_SLUG[slug]
    const md = formatted[key] ?? ''
    const body = markdownToPageBodyLexical(md)
    const p = trustPages.find((x) => x.slug === slug)
    if (!p) continue
    await payload.update({
      collection: 'pages',
      id: p.id,
      data: {
        title: TRUST_PAGE_TITLE[slug],
        body,
        status: 'published' as const,
        publishedAt: new Date().toISOString(),
        ...doneData,
      } as never,
      overrideAccess: true,
    })
  }

  await incrementSiteQuotaUsage(payload, siteId, { openrouterUsd: OPENROUTER_EST_USD })
  return { ok: true, siteId }
}

export { TRUST_BUNDLE_SLUGS, TRUST_BUNDLE_LOCALE } from '@/utilities/sitePagesBundleContent/trustPageConstants'
