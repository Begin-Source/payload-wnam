import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

import {
  getSeoPublishAuthorityFirstProfileFields,
  getSeoScaleFreshnessProfileFields,
  SEO_PIPELINE_AUTHORITY_FIRST_SLUG,
  SEO_PIPELINE_SCALE_FRESH_SLUG,
} from '@/utilities/seoTheoryPipelineProfilePresets'

const JIYUAN_KEJI_TENANT_NAME = '基源科技'

/**
 * Seeds publish-readiness pipeline profiles for tenant **基源科技** only:
 * `publish-authority-eeat-v1`, `scale-freshness-parallel-v1`.
 * Idempotent: skips when slug already exists for that tenant.
 * Does not change `isDefault` (both `isDefault: false`).
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  const tableCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'pipeline_profiles'`,
  )
  if (!tableCheck?.c) return

  const tenants = await payload.find({
    collection: 'tenants',
    where: { name: { equals: JIYUAN_KEJI_TENANT_NAME } },
    limit: 5,
    depth: 0,
    overrideAccess: true,
    req,
  })

  if (tenants.docs.length === 0) {
    payload.logger.warn(
      `[migration 20260513_120000_seed_jiyuan_keji_advanced_pipeline_profiles] No tenant with name "${JIYUAN_KEJI_TENANT_NAME}"; skip.`,
    )
    return
  }
  if (tenants.docs.length > 1) {
    payload.logger.warn(
      `[migration 20260513_120000_seed_jiyuan_keji_advanced_pipeline_profiles] Multiple tenants named "${JIYUAN_KEJI_TENANT_NAME}" (${tenants.docs.length}); seeding the first match only (id=${String(tenants.docs[0]?.id)}).`,
    )
  }

  const tenantId = tenants.docs[0]?.id
  if (typeof tenantId !== 'number') return

  const seeds: Array<{ slug: string; fields: Record<string, unknown> }> = [
    { slug: SEO_PIPELINE_AUTHORITY_FIRST_SLUG, fields: getSeoPublishAuthorityFirstProfileFields(false) },
    { slug: SEO_PIPELINE_SCALE_FRESH_SLUG, fields: getSeoScaleFreshnessProfileFields(false) },
  ]

  for (const { slug, fields } of seeds) {
    const existing = await payload.find({
      collection: 'pipeline-profiles',
      where: {
        and: [{ tenant: { equals: tenantId } }, { slug: { equals: slug } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (existing.docs.length > 0) continue

    await payload.create({
      collection: 'pipeline-profiles',
      data: {
        tenant: tenantId,
        ...fields,
      },
      overrideAccess: true,
      req,
    })
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260513_120000_seed_jiyuan_keji_advanced_pipeline_profiles is irreversible; delete rows in Admin if needed.',
  )
}
