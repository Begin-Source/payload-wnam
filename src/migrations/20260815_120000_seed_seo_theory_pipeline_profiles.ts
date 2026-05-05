import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

import {
  getSeoTheoryGrowthPipelineProfileFields,
  getSeoTheoryQualityPipelineProfileFields,
  SEO_THEORY_GROWTH_SLUG,
  SEO_THEORY_QUALITY_SLUG,
} from '@/utilities/seoTheoryPipelineProfilePresets'

/**
 * Seeds two SEO-theory `pipeline-profiles` per tenant (`growth-commercial`, `quality-constrained`).
 * Idempotent: skips when slug already exists for tenant.
 * Sets `isDefault` on growth only when the tenant has no existing default profile.
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

      const defaultExisting = await payload.find({
        collection: 'pipeline-profiles',
        where: {
          and: [{ tenant: { equals: tenantId } }, { isDefault: { equals: true } }],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      })
      const growthIsDefault = defaultExisting.docs.length === 0

      const growthExisting = await payload.find({
        collection: 'pipeline-profiles',
        where: {
          and: [{ tenant: { equals: tenantId } }, { slug: { equals: SEO_THEORY_GROWTH_SLUG } }],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      })
      if (growthExisting.docs.length === 0) {
        await payload.create({
          collection: 'pipeline-profiles',
          data: {
            tenant: tenantId,
            ...getSeoTheoryGrowthPipelineProfileFields(growthIsDefault),
          },
          overrideAccess: true,
          req,
        })
      }

      const qualityExisting = await payload.find({
        collection: 'pipeline-profiles',
        where: {
          and: [{ tenant: { equals: tenantId } }, { slug: { equals: SEO_THEORY_QUALITY_SLUG } }],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      })
      if (qualityExisting.docs.length === 0) {
        await payload.create({
          collection: 'pipeline-profiles',
          data: {
            tenant: tenantId,
            ...getSeoTheoryQualityPipelineProfileFields(),
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
    'Migration 20260815_120000_seed_seo_theory_pipeline_profiles is irreversible; delete rows in Admin if needed.',
  )
}
