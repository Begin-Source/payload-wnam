import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

type TableInfoRow = { name: string }

type PresetSeed = {
  name: string
  slug: string
  description: string
  batchMode:
    | 'default'
    | 'quick_wins'
    | 'high_commission_affiliate'
    | 'comparison_decision'
    | 'geo_friendly'
    | 'pillar_sprint'
    | 'seasonal'
    | 'refresh_decay'
  defaultBatchLimit: number
  eligibleOnly?: boolean
  intentWhitelist?: string
  minVolume?: number
  maxVolume?: number
  maxKd?: number
  maxPick?: number
  clusterBeforeEnqueue?: boolean
  clusterMinOverlap?: number
  geoIntentWhitelist?: string
  geoQuestionOnly?: boolean
  minSeasonalScore?: number
  decayThreshold?: number
}

const COMPLETE_KEYWORD_BATCH_PRESETS: PresetSeed[] = [
  {
    name: '默认机会分排产（推荐：发布质量80+）',
    slug: 'default-opportunity',
    description:
      '推荐配对 SEO 流水线：发布质量80+。按本站 active/draft 关键词机会分排序排产 Brief；适合常规内容生产。',
    batchMode: 'default',
    defaultBatchLimit: 10,
  },
  {
    name: 'Quick-win 商业词（推荐：发布质量80+）',
    slug: 'quick-win-commercial',
    description:
      '推荐配对 SEO 流水线：发布质量80+。筛选 eligible=true、商业/交易意图、volume >= 30、KD <= 30，并在入队前按 SERP 聚类合并同意图词；适合新站快速验证可排名 money/support content。',
    batchMode: 'quick_wins',
    defaultBatchLimit: 10,
    eligibleOnly: true,
    intentWhitelist: 'commercial, transactional',
    minVolume: 30,
    maxVolume: 1000000,
    maxKd: 30,
    maxPick: 10,
    clusterBeforeEnqueue: true,
    clusterMinOverlap: 3,
  },
  {
    name: '高价值类目词（推荐：发布质量80+）',
    slug: 'high-commission-affiliate',
    description:
      '推荐配对 SEO 流水线：发布质量80+。筛选 eligible=true、商业/交易意图、volume >= 150、KD <= 45，且词面命中高价值 Amazon affiliate 类目（home/kitchen/tools/outdoor/pet/beauty/electronics 等）。真实优先级后续应由佣金率 × 客单价配置表驱动。适合做 best/review/listicle money content。',
    batchMode: 'high_commission_affiliate',
    defaultBatchLimit: 10,
    eligibleOnly: true,
    intentWhitelist: 'commercial, transactional',
    minVolume: 150,
    maxKd: 45,
    clusterBeforeEnqueue: false,
  },
  {
    name: '对比决策词（推荐：发布质量80+）',
    slug: 'comparison-decision',
    description:
      '推荐配对 SEO 流水线：发布质量80+。筛选商业/交易意图、volume >= 50、KD <= 55，且词面命中 vs/review/alternatives/worth it/best under 等购买决策修饰词；不强制 eligible=true，避免漏掉低 volume 但转化强的长尾词。适合做 comparison、alternative、review、buyer guide。',
    batchMode: 'comparison_decision',
    defaultBatchLimit: 10,
    eligibleOnly: false,
    intentWhitelist: 'commercial, transactional',
    minVolume: 50,
    maxKd: 55,
    clusterBeforeEnqueue: false,
  },
  {
    name: 'GEO / AI 引用向（支持内链权威）',
    slug: 'geo-friendly',
    description:
      '信息型、定义型、FAQ、对比框架内容，服务 AI Overview / AI 引用可见度，并给 money page 做内链支撑；GEO 是辅助策略，不替代主要收入页生产。',
    batchMode: 'geo_friendly',
    defaultBatchLimit: 10,
    geoIntentWhitelist: 'informational, commercial',
    geoQuestionOnly: false,
  },
  {
    name: 'Pillar 冲刺（簇内补全）',
    slug: 'pillar-sprint',
    description:
      '围绕指定 pillar 关键词补齐簇内支持内容，适合提升主题权威和内链结构；使用前建议在预设或弹窗中指定 Pillar 关键词 ID。',
    batchMode: 'pillar_sprint',
    defaultBatchLimit: 10,
  },
  {
    name: '季节 / Trend 峰值向',
    slug: 'seasonal-trend',
    description:
      '按 trend / seasonal score 排产季节性内容，适合节日、开学、露营季、换季等短中期机会。',
    batchMode: 'seasonal',
    defaultBatchLimit: 10,
    minSeasonalScore: 0.7,
  },
  {
    name: '衰减刷新（排名恢复）',
    slug: 'refresh-decay',
    description:
      '按排名/表现衰减分触发 content_refresh，不是新文章生产；适合已有文章的标题、内容、产品和内链更新。',
    batchMode: 'refresh_decay',
    defaultBatchLimit: 10,
    decayThreshold: 0.5,
  },
]

async function ensureStrategyColumns(db: MigrateUpArgs['db']): Promise<void> {
  const cols = await db.all<TableInfoRow>(sql`PRAGMA table_info('keyword_batch_presets')`)

  if (!cols.some((c) => c.name === 'geo_intent_whitelist')) {
    await db.run(
      sql`ALTER TABLE \`keyword_batch_presets\` ADD \`geo_intent_whitelist\` text DEFAULT 'informational, commercial';`,
    )
  }
  if (!cols.some((c) => c.name === 'geo_question_only')) {
    await db.run(
      sql`ALTER TABLE \`keyword_batch_presets\` ADD \`geo_question_only\` integer DEFAULT 0;`,
    )
  }
  if (!cols.some((c) => c.name === 'pillar_keyword_id')) {
    await db.run(sql`ALTER TABLE \`keyword_batch_presets\` ADD \`pillar_keyword_id\` numeric;`)
  }
  if (!cols.some((c) => c.name === 'min_seasonal_score')) {
    await db.run(
      sql`ALTER TABLE \`keyword_batch_presets\` ADD \`min_seasonal_score\` numeric DEFAULT 0.7;`,
    )
  }
  if (!cols.some((c) => c.name === 'decay_threshold')) {
    await db.run(
      sql`ALTER TABLE \`keyword_batch_presets\` ADD \`decay_threshold\` numeric DEFAULT 0.5;`,
    )
  }
}

/**
 * Seeds the full keyword batch preset menu for each tenant.
 * Idempotent: updates rows when the tenant+slug already exists.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  const tableCheck = await db.get<{ c: number }>(
    sql`SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'keyword_batch_presets'`,
  )
  if (!tableCheck?.c) return

  await ensureStrategyColumns(db)

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

      for (const seed of COMPLETE_KEYWORD_BATCH_PRESETS) {
        const existing = await payload.find({
          collection: 'keyword-batch-presets',
          where: {
            and: [{ tenant: { equals: tenantId } }, { slug: { equals: seed.slug } }],
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
          eligibleOnly: seed.eligibleOnly,
          intentWhitelist: seed.intentWhitelist,
          minVolume: seed.minVolume,
          maxVolume: seed.maxVolume,
          maxKd: seed.maxKd,
          maxPick: seed.maxPick,
          clusterBeforeEnqueue: seed.clusterBeforeEnqueue,
          clusterMinOverlap: seed.clusterMinOverlap,
          geoIntentWhitelist: seed.geoIntentWhitelist,
          geoQuestionOnly: seed.geoQuestionOnly,
          minSeasonalScore: seed.minSeasonalScore,
          decayThreshold: seed.decayThreshold,
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
    'Migration 20260518_120000_seed_complete_keyword_batch_presets is irreversible; delete rows in Admin if needed.',
  )
}
