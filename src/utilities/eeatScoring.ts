/** CORE-EEAT / data vetoes that must never ship as “published”. */
export const HARD_VETO_CODES = ['T04', 'C01', 'R10'] as const

export function isHardVetoCode(id: string): boolean {
  return (HARD_VETO_CODES as readonly string[]).includes(id)
}

export function listContainsHardVeto(vetoes: string[]): boolean {
  return vetoes.some((v) => isHardVetoCode(v))
}

/**
 * content-quality-auditor decision table: 0/1/2+ vetoes, floor scores.
 * See .agents/skills/content-quality-auditor/SKILL.md
 */
export function applyAuditorVetoTable(input: {
  rawOverallScore: number
  vetoCount: number
}): { capApplied: boolean; finalOverallScore: number; blocked: boolean } {
  const { rawOverallScore, vetoCount } = input
  if (vetoCount === 0) {
    return { capApplied: false, finalOverallScore: Math.floor(rawOverallScore), blocked: false }
  }
  if (vetoCount === 1) {
    if (rawOverallScore >= 60) {
      return { capApplied: true, finalOverallScore: 60, blocked: false }
    }
    return { capApplied: true, finalOverallScore: Math.floor(Math.min(59, rawOverallScore)), blocked: true }
  }
  return { capApplied: true, finalOverallScore: 0, blocked: true }
}
