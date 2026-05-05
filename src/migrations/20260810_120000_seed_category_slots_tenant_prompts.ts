import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

import { DEFAULT_CATEGORY_SLOTS_SHORTNAME_BODIES } from '@/utilities/categorySlotsGeneration/defaultCategorySlotsPromptBodies'
import { CATEGORY_SLOTS_PROMPT_KEYS } from '@/utilities/domainGeneration/promptKeys'

/**
 * Seeds two category-slots prompt rows per tenant (shortname OpenRouter step).
 * Idempotent: skips when (tenant, key) already exists.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  const tableCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'tenant_prompt_templates'`,
  )
  if (!tableCheck?.c) return

  let page = 1
  const limit = 100
  let hasMore = true
  while (hasMore) {
    const res = await payload.find({
      collection: 'tenants',
      limit,
      page,
      depth: 0,
      overrideAccess: true,
      req,
    })

    for (const tenant of res.docs) {
      const tenantId = tenant.id
      if (typeof tenantId !== 'number') continue

      for (const key of CATEGORY_SLOTS_PROMPT_KEYS) {
        const existing = await payload.find({
          collection: 'tenant-prompt-templates',
          where: {
            and: [{ tenant: { equals: tenantId } }, { key: { equals: key } }],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          req,
        })
        if (existing.docs.length > 0) continue

        await payload.create({
          collection: 'tenant-prompt-templates',
          data: {
            tenant: tenantId,
            key,
            body: DEFAULT_CATEGORY_SLOTS_SHORTNAME_BODIES[key],
          },
          overrideAccess: true,
          req,
        })
      }
    }

    hasMore = res.hasNextPage === true
    page += 1
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260810_120000_seed_category_slots_tenant_prompts is irreversible; delete rows in Admin if needed.',
  )
}
