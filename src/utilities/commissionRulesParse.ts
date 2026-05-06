/**
 * Parsed from global `commission-rules.rules` JSON (best-effort).
 */
export type CommissionRulesParsed = {
  defaultEmployeePct: number
  defaultLeaderCutPct: number
  defaultOpsCutPct: number
  costInclusion: { ai: boolean; dfs?: boolean }
  roundingMode: 'floor' | 'nearest'
}

const DEFAULTS: CommissionRulesParsed = {
  defaultEmployeePct: 30,
  defaultLeaderCutPct: 5,
  defaultOpsCutPct: 3,
  costInclusion: { ai: true, dfs: false },
  roundingMode: 'nearest',
}

export function parseCommissionRulesJson(raw: unknown): CommissionRulesParsed {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULTS }
  }
  const r = raw as Record<string, unknown>
  const num = (v: unknown, d: number): number => {
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : d
  }
  const ci = r.costInclusion
  const costInclusion =
    ci && typeof ci === 'object' && !Array.isArray(ci)
      ? {
          ai: (ci as { ai?: unknown }).ai !== false,
          dfs: Boolean((ci as { dfs?: unknown }).dfs),
        }
      : DEFAULTS.costInclusion
  const rm = r.roundingMode === 'floor' ? 'floor' : 'nearest'
  return {
    defaultEmployeePct: Math.min(100, Math.max(0, num(r.defaultEmployeePct ?? r.defaultPct, DEFAULTS.defaultEmployeePct))),
    defaultLeaderCutPct: Math.min(100, Math.max(0, num(r.defaultLeaderCutPct, DEFAULTS.defaultLeaderCutPct))),
    defaultOpsCutPct: Math.min(100, Math.max(0, num(r.defaultOpsCutPct, DEFAULTS.defaultOpsCutPct))),
    costInclusion,
    roundingMode: rm,
  }
}

export function roundMoney(amount: number, mode: 'floor' | 'nearest'): number {
  const scaled = amount * 100
  if (mode === 'floor') return Math.floor(scaled + 1e-9) / 100
  return Math.round(scaled) / 100
}
