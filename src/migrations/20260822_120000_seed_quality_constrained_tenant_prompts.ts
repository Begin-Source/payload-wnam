import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

import { SEO_THEORY_QUALITY_SLUG } from '@/utilities/seoTheoryPipelineProfilePresets'
import { QUALITY_CONSTRAINED_TENANT_PROMPT_BODIES } from '@/utilities/openRouterTenantPrompts/qualityConstrainedTenantPromptBodies'

/**
 * Seeds profile-scoped tenant-prompt-templates for SEO theory preset
 * `quality-constrained` (稳健 / 质量门槛) — SERP brief + draft section + finalize passes.
 * Idempotent: skips when (tenant, key, pipelineProfile) already exists.
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
      const tenantId = (tenant as { id?: unknown }).id
      if (typeof tenantId !== 'number') continue

      const profileRes = await payload.find({
        collection: 'pipeline-profiles',
        where: {
          and: [
            { tenant: { equals: tenantId } },
            { slug: { equals: SEO_THEORY_QUALITY_SLUG } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      })
      const profileId = profileRes.docs[0]?.id
      if (typeof profileId !== 'number') continue

      for (const [key, body] of Object.entries(QUALITY_CONSTRAINED_TENANT_PROMPT_BODIES)) {
        if (!body) continue
        const existing = await payload.find({
          collection: 'tenant-prompt-templates',
          where: {
            and: [
              { tenant: { equals: tenantId } },
              { key: { equals: key } },
              { pipelineProfile: { equals: profileId } },
            ],
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
            body,
            pipelineProfile: profileId,
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
    'Migration 20260822_120000_seed_quality_constrained_tenant_prompts is irreversible; delete rows in Admin if needed.',
  )
}
