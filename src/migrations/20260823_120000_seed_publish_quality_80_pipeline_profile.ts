import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

import {
  getSeoPublishQuality80ProfileFields,
  SEO_PIPELINE_PUBLISH_QUALITY_80_SLUG,
} from '@/utilities/seoTheoryPipelineProfilePresets'

/**
 * Seeds one explicit 80+ publish-quality pipeline profile per tenant.
 * Idempotent: skips when `publish-quality-80-v1` already exists for that tenant.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  const tableCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'pipeline_profiles'`,
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

      const existing = await payload.find({
        collection: 'pipeline-profiles',
        where: {
          and: [
            { tenant: { equals: tenantId } },
            { slug: { equals: SEO_PIPELINE_PUBLISH_QUALITY_80_SLUG } },
          ],
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
          ...getSeoPublishQuality80ProfileFields(false),
        },
        overrideAccess: true,
        req,
      })
    }

    hasMore = res.hasNextPage === true
    page += 1
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260823_120000_seed_publish_quality_80_pipeline_profile is irreversible; delete rows in Admin if needed.',
  )
}
