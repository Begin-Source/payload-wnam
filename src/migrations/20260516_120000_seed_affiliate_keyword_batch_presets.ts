import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type PresetSeed = {
  name: string
  slug: string
  description: string
  batchMode: 'high_commission_affiliate' | 'comparison_decision'
  defaultBatchLimit: number
}

const AFFILIATE_KEYWORD_PRESETS: PresetSeed[] = [
  {
    name: '高价值类目词（推荐：发布质量80+）',
    slug: 'high-commission-affiliate',
    description:
      '推荐配对 SEO 流水线：发布质量80+。筛选 eligible=true、商业/交易意图、volume >= 150、KD <= 45，且词面命中高价值 Amazon affiliate 类目（home/kitchen/tools/outdoor/pet/beauty/electronics 等）。真实优先级后续应由佣金率 × 客单价配置表驱动。适合做 best/review/listicle money content。',
    batchMode: 'high_commission_affiliate',
    defaultBatchLimit: 10,
  },
  {
    name: '对比决策词（推荐：发布质量80+）',
    slug: 'comparison-decision',
    description:
      '推荐配对 SEO 流水线：发布质量80+。筛选商业/交易意图、volume >= 50、KD <= 55，且词面命中 vs/review/alternatives/worth it/best under 等购买决策修饰词；不强制 eligible=true，避免漏掉低 volume 但转化强的长尾词。适合做 comparison、alternative、review、buyer guide。',
    batchMode: 'comparison_decision',
    defaultBatchLimit: 10,
  },
]

/**
 * Seeds Amazon affiliate keyword strategies for each tenant.
 * Idempotent: updates rows when the tenant+slug already exists.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  const tableCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'keyword_batch_presets'`,
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

      for (const seed of AFFILIATE_KEYWORD_PRESETS) {
        const existing = await payload.find({
          collection: 'keyword-batch-presets',
          where: {
            and: [
              { tenant: { equals: tenantId } },
              { slug: { equals: seed.slug } },
            ],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          req,
        })

        const data = {
          name: seed.name,
          slug: seed.slug,
          description: seed.description,
          batchMode: seed.batchMode,
          defaultBatchLimit: seed.defaultBatchLimit,
          eligibleOnly: seed.batchMode === 'high_commission_affiliate',
          intentWhitelist: 'commercial, transactional',
          clusterBeforeEnqueue: false,
        }

        const existingDoc = existing.docs[0] as { id?: number | string } | undefined
        if (existingDoc?.id != null) {
          await payload.update({
            collection: 'keyword-batch-presets',
            id: existingDoc.id,
            data,
            overrideAccess: true,
            req,
          })
        } else {
          await payload.create({
            collection: 'keyword-batch-presets',
            data: {
              tenant: tenantId,
              ...data,
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

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error(
    'Migration 20260516_120000_seed_affiliate_keyword_batch_presets is irreversible; delete rows in Admin if needed.',
  )
}
