import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

import { QUALITY_CONSTRAINED_TENANT_PROMPT_BODIES } from '@/utilities/openRouterTenantPrompts/qualityConstrainedTenantPromptBodies'
import {
  qualityPresetDefaultArticleStrategy,
  SEO_THEORY_QUALITY_SLUG,
} from '@/utilities/seoTheoryPipelineProfilePresets'

/**
 * Syncs `quality-constrained` profile:
 * - tenant-prompt-templates bodies (adds `{{seo_workflow_block}}` wiring)
 * - pipeline-profiles.articleStrategy + `seoWorkflow` when missing
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  const tableTpl = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'tenant_prompt_templates'`,
  )
  if (tableTpl?.c) {
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
          const row = existing.docs[0] as { id?: string | number } | undefined
          if (row?.id != null) {
            await payload.update({
              collection: 'tenant-prompt-templates',
              id: row.id,
              data: { body },
              overrideAccess: true,
              req,
            })
          } else {
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
      }

      hasMore = res.hasNextPage === true
      page += 1
    }
  }

  const tableProfiles = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'pipeline_profiles'`,
  )
  if (!tableProfiles?.c) return

  const defaults = qualityPresetDefaultArticleStrategy()
  let p = 1
  let hasMoreProfiles = true
  while (hasMoreProfiles) {
    const pr = await payload.find({
      collection: 'pipeline-profiles',
      where: { slug: { equals: SEO_THEORY_QUALITY_SLUG } },
      limit: 50,
      page: p,
      depth: 0,
      overrideAccess: true,
      req,
    })
    for (const doc of pr.docs) {
      const id = (doc as { id?: unknown }).id
      if (id == null) continue
      const cur = (doc as { articleStrategy?: unknown }).articleStrategy
      const base =
        cur && typeof cur === 'object' && !Array.isArray(cur) ? ({ ...cur } as Record<string, unknown>) : {}
      const hasWf =
        base.seoWorkflow != null && typeof base.seoWorkflow === 'object' && !Array.isArray(base.seoWorkflow)
      if (hasWf) continue

      await payload.update({
        collection: 'pipeline-profiles',
        id,
        data: {
          articleStrategy: {
            ...defaults,
            ...base,
            seoWorkflow: defaults.seoWorkflow,
          },
        },
        overrideAccess: true,
        req,
      })
    }
    hasMoreProfiles = pr.hasNextPage === true
    p += 1
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260510_140000_quality_constrained_seo_workflow_sync is irreversible; restore from backup if needed.',
  )
}
