/**
 * Hybrid AI USD charges for ledger: prefer OpenRouter `usage.cost`, else token table, else fixed fallback per task kind.
 * Together image: parse numeric fields from JSON when present, else fixed estimate (~quota presets).
 */

export type AiPricingSource =
  | 'openrouter_usage_cost'
  | 'token_estimate'
  | 'fixed_kind_fallback'
  | 'together_response_cost'
  | 'together_fixed_estimate'

/** Aligns with rough presets in siteQuotaCheck (billing-grade ledger uses resolved USD below when possible). */
export const OPENROUTER_KIND_FALLBACK_USD: Record<string, number> = {
  offer_review_mdx: 0.04,
  category_slots: 0.03,
  site_pages_bundle_content: 0.05,
  amz_template_design: 0.06,
  brief_generate: 0.025,
  draft_skeleton: 0.015,
  draft_section: 0.01,
  draft_finalize: 0.02,
  competitor_gap: 0.02,
  domain_audit: 0.015,
  domain_generation_audience: 0.012,
  domain_generation_domain: 0.012,
  alert_eval: 0.02,
  content_audit: 0.02,
  content_refresh: 0.02,
  meta_ab_optimize: 0.005,
}

/** $ per 1K tokens — broad defaults when `usage.cost` missing (OpenRouter model ids). */
const PROMPT_PER_1K: Partial<Record<string, { in: number; out: number }>> = {
  'google/gemini-2.5-flash-lite': { in: 0.00005, out: 0.0002 },
  'google/gemini-2.5-flash': { in: 0.0001, out: 0.0004 },
  'google/gemini-2.0-flash-lite': { in: 0.00005, out: 0.0002 },
  'openai/gpt-4o-mini': { in: 0.00015, out: 0.0006 },
  'openai/gpt-4o': { in: 0.0025, out: 0.01 },
  'anthropic/claude-3.5-sonnet': { in: 0.003, out: 0.015 },
}

function tokensPer1kForModel(model: string): { in: number; out: number } {
  const m = model.trim()
  if (PROMPT_PER_1K[m]) return PROMPT_PER_1K[m]!
  if (m.includes('gemini') && m.includes('flash-lite')) return { in: 0.00005, out: 0.0002 }
  if (m.includes('gemini') && m.includes('flash')) return { in: 0.0001, out: 0.0004 }
  if (m.includes('gpt-4o-mini')) return { in: 0.00015, out: 0.0006 }
  if (m.includes('claude')) return { in: 0.003, out: 0.015 }
  return { in: 0.0002, out: 0.0008 }
}

export type NormalizedUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  cost?: number
}

/** Merge typed usage with extended OpenRouter fields from raw JSON. */
export function mergeOpenRouterUsage(
  usage: NormalizedUsage | undefined,
  raw: unknown,
): NormalizedUsage | undefined {
  const fromTyped = usage && typeof usage === 'object' ? { ...usage } : {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return Object.keys(fromTyped).length ? (fromTyped as NormalizedUsage) : usage
  }
  const u = (raw as { usage?: unknown }).usage
  if (!u || typeof u !== 'object' || Array.isArray(u)) {
    return Object.keys(fromTyped).length ? (fromTyped as NormalizedUsage) : usage
  }
  const ext = u as Record<string, unknown>
  const pt = ext.prompt_tokens
  const ct = ext.completion_tokens
  const tt = ext.total_tokens
  const cost = ext.cost
  return {
    ...fromTyped,
    ...(typeof pt === 'number' ? { prompt_tokens: pt } : {}),
    ...(typeof ct === 'number' ? { completion_tokens: ct } : {}),
    ...(typeof tt === 'number' ? { total_tokens: tt } : {}),
    ...(typeof cost === 'number' && Number.isFinite(cost) ? { cost } : {}),
  }
}

function finitePositive(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null
  return n
}

/**
 * Prefer OpenRouter `usage.cost` (USD); else token estimate; else kind fallback (required for positive ledger line).
 */
export function resolveOpenRouterChargeUsd(args: {
  model: string
  usage?: NormalizedUsage
  raw?: unknown
  kind: string
}): { usd: number; source: AiPricingSource; meta: Record<string, unknown> } {
  const merged = mergeOpenRouterUsage(args.usage, args.raw)
  const fromCost = finitePositive(merged?.cost)
  if (fromCost != null) {
    return {
      usd: roundUsd(fromCost),
      source: 'openrouter_usage_cost',
      meta: {
        pricingSource: 'openrouter_usage_cost',
        model: args.model,
        usage: merged ?? null,
      },
    }
  }

  const pt = merged?.prompt_tokens ?? 0
  const ct = merged?.completion_tokens ?? 0
  if ((pt > 0 || ct > 0) && args.model) {
    const rates = tokensPer1kForModel(args.model)
    const est = (pt / 1000) * rates.in + (ct / 1000) * rates.out
    if (Number.isFinite(est) && est > 0) {
      return {
        usd: roundUsd(est),
        source: 'token_estimate',
        meta: {
          pricingSource: 'token_estimate',
          model: args.model,
          usage: merged ?? null,
          rates,
        },
      }
    }
  }

  const fb = OPENROUTER_KIND_FALLBACK_USD[args.kind]
  const usd = fb != null && fb > 0 ? fb : OPENROUTER_KIND_FALLBACK_USD.draft_section ?? 0.02
  return {
    usd: roundUsd(usd),
    source: 'fixed_kind_fallback',
    meta: {
      pricingSource: 'fixed_kind_fallback',
      kind: args.kind,
      model: args.model,
      usage: merged ?? null,
    },
  }
}

function roundUsd(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

/** Default per Together image job when API returns no USD (matches siteQuotaCheck image jobs). */
export const TOGETHER_IMAGE_FIXED_USD = 0.05

function pickFirstNumericUsd(obj: unknown, depth = 0): number | null {
  if (depth > 6 || obj == null) return null
  if (typeof obj === 'number' && Number.isFinite(obj) && obj > 0 && obj < 1e6) {
    return obj
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) return null
  const keys = ['cost', 'total_cost', 'usage_cost', 'usd', 'price', 'amount']
  for (const k of keys) {
    if (k in (obj as object)) {
      const v = (obj as Record<string, unknown>)[k]
      const n = finitePositive(v)
      if (n != null && n < 1000) return n
    }
  }
  for (const v of Object.values(obj)) {
    const n = pickFirstNumericUsd(v, depth + 1)
    if (n != null) return n
  }
  return null
}

export function resolveTogetherImageChargeUsd(args: {
  raw?: unknown
  kind: string
  fixedUsd?: number
}): { usd: number; source: AiPricingSource; meta: Record<string, unknown> } {
  const parsed = args.raw != null ? pickFirstNumericUsd(args.raw) : null
  if (parsed != null) {
    return {
      usd: roundUsd(parsed),
      source: 'together_response_cost',
      meta: {
        pricingSource: 'together_response_cost',
        kind: args.kind,
      },
    }
  }
  const fx = args.fixedUsd ?? TOGETHER_IMAGE_FIXED_USD
  return {
    usd: roundUsd(fx),
    source: 'together_fixed_estimate',
    meta: {
      pricingSource: 'together_fixed_estimate',
      kind: args.kind,
    },
  }
}
