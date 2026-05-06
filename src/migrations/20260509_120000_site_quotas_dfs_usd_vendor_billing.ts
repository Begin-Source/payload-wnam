import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Vendor billing: legacy abstract DFS counters → USD fields aligned with DataForSEO tasks[].cost.
 * Heuristic ONLY — operators should review caps after deploy.
 */
const LEGACY_DFS_UNIT_TO_USD = 0.02

const MIGRATED_AT_KEY = '__dfsUsdVendorBillingMigratedAt'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const rows = await db.all<{
    id: number
    usage_ytd: string | null
    monthly_dfs_credit_budget: number | string | null
  }>(sql`SELECT id, usage_ytd, monthly_dfs_credit_budget FROM site_quotas`)

  for (const r of rows) {
    let usageJson: Record<string, unknown> = {}
    if (r.usage_ytd && typeof r.usage_ytd === 'string' && r.usage_ytd.trim()) {
      try {
        const parsed = JSON.parse(r.usage_ytd) as Record<string, unknown>
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) usageJson = parsed
      } catch {
        usageJson = {}
      }
    }

    const alreadyMigrated =
      typeof usageJson[MIGRATED_AT_KEY] === 'string' &&
      String(usageJson[MIGRATED_AT_KEY]).trim().length > 0

    const dfsRaw = usageJson.dfs
    const dfsNum =
      typeof dfsRaw === 'number' && Number.isFinite(dfsRaw)
        ? dfsRaw
        : typeof dfsRaw === 'string'
          ? Number(dfsRaw)
          : 0
    const dfsLegacy =
      typeof dfsNum === 'number' && Number.isFinite(dfsNum) && dfsNum > 0 ? dfsNum : 0

    const existingUsdRaw = usageJson.dataForSeoUsd
    const existingUsd =
      typeof existingUsdRaw === 'number' && Number.isFinite(existingUsdRaw) ? existingUsdRaw : 0

    delete usageJson.dfs
    usageJson.dataForSeoUsd = existingUsd + dfsLegacy * LEGACY_DFS_UNIT_TO_USD
    if (!alreadyMigrated) {
      usageJson[MIGRATED_AT_KEY] = new Date().toISOString()
    }

    const serial = JSON.stringify(usageJson)

    const budgetRaw = r.monthly_dfs_credit_budget
    const budgetNum =
      typeof budgetRaw === 'number' && Number.isFinite(budgetRaw)
        ? budgetRaw
        : typeof budgetRaw === 'string'
          ? Number(budgetRaw)
          : 0
    const oldBudget =
      typeof budgetNum === 'number' && Number.isFinite(budgetNum) && budgetNum >= 0 ? budgetNum : 0
    const newBudget = alreadyMigrated ? oldBudget : oldBudget * LEGACY_DFS_UNIT_TO_USD

    await db.run(
      sql`UPDATE site_quotas SET usage_ytd = ${serial}, monthly_dfs_credit_budget = ${newBudget} WHERE id = ${r.id}`,
    )
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db
  /** Irreversible — USD totals cannot map back to legacy abstract DFS integers. */
}
