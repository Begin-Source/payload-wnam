import type { Payload } from 'payload'

/**
 * Legacy: abstract DFS counter × LEGACY_DFS_UNIT_TO_USD → folded into dataForSeoUsd when reading until migrated away.
 */
export const LEGACY_DFS_UNIT_TO_USD = 0.02

/**
 * SiteQuotas.usageYtd counters (incremented by pipeline routes on best-effort basis).
 */
export type UsageYtdShape = {
  /** DataForSEO Standard/Labs tasks[].cost (USD), summed */
  dataForSeoUsd?: number
  /** @deprecated Use dataForSeoUsd — migrated by coercion until absent */
  dfs?: number
  openrouterUsd?: number
  imagesUsd?: number
  tavilyUsd?: number
  /** Tavily Search usage.credits (integer), summed only on live API responses */
  tavilyCredits?: number
}

function parseUsage(raw: unknown): UsageYtdShape {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw as UsageYtdShape
}

/** Stored usage normalized for arithmetic / quota checks (legacy dfs folded once into USD). */
export function coerceUsageYtdStored(raw: unknown): UsageYtdShape {
  const base = parseUsage(raw)
  const dfsLegacy =
    typeof base.dfs === 'number' && Number.isFinite(base.dfs) && base.dfs > 0 ? base.dfs : 0
  const foldedUsd = dfsLegacy * LEGACY_DFS_UNIT_TO_USD
  const existingUsd =
    typeof base.dataForSeoUsd === 'number' && Number.isFinite(base.dataForSeoUsd)
      ? base.dataForSeoUsd
      : 0
  return {
    dataForSeoUsd: existingUsd + foldedUsd,
    openrouterUsd:
      typeof base.openrouterUsd === 'number' && Number.isFinite(base.openrouterUsd)
        ? base.openrouterUsd
        : 0,
    imagesUsd:
      typeof base.imagesUsd === 'number' && Number.isFinite(base.imagesUsd) ? base.imagesUsd : 0,
    tavilyUsd:
      typeof base.tavilyUsd === 'number' && Number.isFinite(base.tavilyUsd) ? base.tavilyUsd : 0,
    tavilyCredits:
      typeof base.tavilyCredits === 'number' && Number.isFinite(base.tavilyCredits)
        ? Math.floor(base.tavilyCredits)
        : 0,
  }
}

function roundUsd(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

/** Preserve migration / internal keys on usageYtd JSON (e.g. __dfsUsdVendorBillingMigratedAt). */
function usageYtdPreservedMeta(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k.startsWith('__')) out[k] = v
  }
  return out
}

export type SiteQuotaRow = {
  docId: number
  monthlyTokenBudgetUsd: number
  monthlyImagesBudgetUsd: number
  monthlyDfsCreditBudget: number
  usageYtd: UsageYtdShape
  maxMonthlyAiRuns: number
}

export async function findSiteQuotaForSite(payload: Payload, siteId: number): Promise<SiteQuotaRow | null> {
  const r = await payload.find({
    collection: 'site-quotas',
    where: { site: { equals: siteId } },
    limit: 1,
    depth: 0,
  })
  const d = r.docs[0] as
    | {
        id: number
        monthlyTokenBudgetUsd?: number | null
        monthlyImagesBudgetUsd?: number | null
        monthlyDfsCreditBudget?: number | null
        usageYtd?: unknown
        maxMonthlyAiRuns?: number | null
      }
    | undefined
  if (!d) return null
  return {
    docId: d.id,
    monthlyTokenBudgetUsd: Number(d.monthlyTokenBudgetUsd) || 0,
    monthlyImagesBudgetUsd: Number(d.monthlyImagesBudgetUsd) || 0,
    monthlyDfsCreditBudget: Number(d.monthlyDfsCreditBudget) || 0,
    usageYtd: coerceUsageYtdStored(d.usageYtd),
    maxMonthlyAiRuns: Number(d.maxMonthlyAiRuns) || 0,
  }
}

/** Rough per-job USD estimates for pre-flight checks (not billing-grade). */
const EST_OPENROUTER_USD: Partial<Record<string, number>> = {
  category_slots: 0.03,
  /** n8n Site Pages Bundle — one OpenRouter call, five pages written */
  site_pages_bundle_content: 0.05,
  amz_template_design: 0.06,
  brief_generate: 0.025,
  draft_skeleton: 0.015,
  draft_section: 0.01,
  draft_finalize: 0.02,
  competitor_gap: 0.02,
  domain_audit: 0.015,
  content_audit: 0.02,
  content_refresh: 0.02,
  meta_ab_optimize: 0.005,
}

/** Legacy DFS integer weights × LEGACY_DFS_UNIT_TO_USD → expected USD ceiling */
const EST_DATAFORSEO_LEGACY_UNITS: Partial<Record<string, number>> = {
  keyword_discover: 2,
  keyword_cluster: 10,
  rank_track: 1,
  serp_audit: 1,
  backlink_scan: 3,
  amazon_sync: 1,
}

export function jobTypeToSpendCategories(jobType: string): {
  openrouterUsd?: number
  dataForSeoUsd?: number
  imagesUsd?: number
} {
  const o = EST_OPENROUTER_USD[jobType]
  const d = EST_DATAFORSEO_LEGACY_UNITS[jobType]
  const out: { openrouterUsd?: number; dataForSeoUsd?: number; imagesUsd?: number } = {}
  if (o != null) out.openrouterUsd = o
  if (d != null) out.dataForSeoUsd = d * LEGACY_DFS_UNIT_TO_USD
  if (jobType === 'image_generate') out.imagesUsd = 0.05
  if (jobType === 'media_image_generate') out.imagesUsd = 0.05
  if (jobType === 'category_cover_generate') out.imagesUsd = 0.05
  if (jobType === 'hero_banner_generate') out.imagesUsd = 0.05
  if (jobType === 'site_logo_generate') out.imagesUsd = 0.05
  return out
}

export type SpendCheckResult = { ok: true } | { ok: false; message: string }

/**
 * Returns blocked when any configured monthly cap would be exceeded by this job's estimate.
 * Caps ≤ 0 are treated as unlimited for that dimension.
 */
export async function checkPipelineSpendForJob(
  payload: Payload,
  siteId: number | null | undefined,
  jobType: string,
): Promise<SpendCheckResult> {
  if (siteId == null || !Number.isFinite(Number(siteId))) return { ok: true }
  const sid = Math.floor(Number(siteId))
  const row = await findSiteQuotaForSite(payload, sid)
  if (!row) return { ok: true }

  const est = jobTypeToSpendCategories(jobType)
  const u = row.usageYtd

  if (est.openrouterUsd != null && row.monthlyTokenBudgetUsd > 0) {
    const spent = u.openrouterUsd ?? 0
    if (spent + est.openrouterUsd > row.monthlyTokenBudgetUsd) {
      return {
        ok: false,
        message: `OpenRouter 月度预算不足（约已用 $${spent.toFixed(3)} / $${row.monthlyTokenBudgetUsd}，预估本任务 $${est.openrouterUsd}）`,
      }
    }
  }

  if (est.dataForSeoUsd != null && row.monthlyDfsCreditBudget > 0) {
    const spent = u.dataForSeoUsd ?? 0
    if (spent + est.dataForSeoUsd > row.monthlyDfsCreditBudget) {
      return {
        ok: false,
        message: `DataForSEO 月度支出上限不足（已用约 $${spent.toFixed(4)} / $${row.monthlyDfsCreditBudget} USD，预估本任务约 $${est.dataForSeoUsd.toFixed(4)}）`,
      }
    }
  }

  if (est.imagesUsd != null && row.monthlyImagesBudgetUsd > 0) {
    const spent = u.imagesUsd ?? 0
    if (spent + est.imagesUsd > row.monthlyImagesBudgetUsd) {
      return {
        ok: false,
        message: `绘图月度预算不足（约已用 $${spent.toFixed(2)} / $${row.monthlyImagesBudgetUsd}）`,
      }
    }
  }

  return { ok: true }
}

/**
 * Merge-increment usageYtd on the site's quota row (creates nothing if row missing).
 */
export async function incrementSiteQuotaUsage(
  payload: Payload,
  siteId: number,
  delta: Partial<UsageYtdShape>,
): Promise<void> {
  const row = await findSiteQuotaForSite(payload, siteId)
  if (!row) return
  const full = await payload.findByID({
    collection: 'site-quotas',
    id: row.docId,
    depth: 0,
    overrideAccess: true,
  })
  const preserved = usageYtdPreservedMeta((full as { usageYtd?: unknown })?.usageYtd)
  const cur = row.usageYtd
  const next: Record<string, unknown> = {
    ...preserved,
    dataForSeoUsd: roundUsd((cur.dataForSeoUsd ?? 0) + (delta.dataForSeoUsd ?? 0)),
    openrouterUsd: roundUsd((cur.openrouterUsd ?? 0) + (delta.openrouterUsd ?? 0)),
    imagesUsd: roundUsd((cur.imagesUsd ?? 0) + (delta.imagesUsd ?? 0)),
    tavilyUsd: roundUsd((cur.tavilyUsd ?? 0) + (delta.tavilyUsd ?? 0)),
    tavilyCredits:
      Math.floor(cur.tavilyCredits ?? 0) + Math.floor(delta.tavilyCredits ?? 0),
  }
  await payload.update({
    collection: 'site-quotas',
    id: row.docId,
    data: { usageYtd: next },
    overrideAccess: true,
  })
}

/** @deprecated Use checkPipelineSpendForJob + incrementSiteQuotaUsage */
export async function assertSiteTokenBudget(
  payload: Payload,
  siteId: string | number,
  incrementUsd: number,
): Promise<void> {
  const sid = typeof siteId === 'number' ? siteId : Number(siteId)
  if (!Number.isFinite(sid)) return
  const chk = await checkPipelineSpendForJob(payload, sid, 'brief_generate')
  if (!chk.ok) throw new Error(chk.message)
  const row = await findSiteQuotaForSite(payload, sid)
  if (row && row.monthlyTokenBudgetUsd > 0) {
    const spent = row.usageYtd.openrouterUsd ?? 0
    if (spent + incrementUsd > row.monthlyTokenBudgetUsd) {
      throw new Error(`Token budget: used $${spent} + $${incrementUsd} exceeds ${row.monthlyTokenBudgetUsd}`)
    }
  }
}
