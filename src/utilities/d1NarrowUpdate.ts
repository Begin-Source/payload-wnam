import type { Payload } from 'payload'

type D1Prepared = {
  bind: (...args: unknown[]) => {
    run: () => Promise<unknown>
    first?: <T = unknown>() => Promise<T | null>
  }
}

type D1Client = {
  prepare: (sql: string) => D1Prepared
}

function isD1Client(value: unknown): value is D1Client {
  return Boolean(value && typeof value === 'object' && typeof (value as D1Client).prepare === 'function')
}

export function d1ClientFromPayload(payload: Payload): D1Client | null {
  const db =
    payload.db as
      | {
          binding?: unknown
          client?: unknown
          drizzle?: { $client?: unknown }
        }
      | undefined

  if (isD1Client(db?.client)) {
    return db.client
  }

  if (isD1Client(db?.drizzle?.$client)) {
    return db.drizzle.$client
  }

  if (isD1Client(db?.binding)) {
    return db.binding
  }

  return null
}

function jsonColumnValue(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

export async function d1NarrowUpdate(
  payload: Payload,
  table: string,
  id: string | number,
  pairs: Array<[column: string, value: unknown]>,
): Promise<boolean> {
  const client = d1ClientFromPayload(payload)
  if (!client) return false

  const safeTable = table.replace(/`/g, '``')
  const safePairs = pairs.map(([column, value]) => [column.replace(/`/g, '``'), value] as const)
  const setSql = safePairs.map(([column]) => `\`${column}\` = ?`).join(', ')
  if (!setSql) return true

  await client
    .prepare(`UPDATE \`${safeTable}\` SET ${setSql}, \`updated_at\` = ? WHERE \`id\` = ?`)
    .bind(...safePairs.map(([, value]) => value), new Date().toISOString(), id)
    .run()
  return true
}

export async function d1NarrowUpdateArticle(
  payload: Payload,
  id: string | number,
  data: {
    body?: unknown
    excerpt?: string | null
    sectionSummaries?: unknown
  },
): Promise<boolean> {
  const pairs: Array<[string, unknown]> = []
  if ('body' in data) pairs.push(['body', jsonColumnValue(data.body)])
  if ('excerpt' in data) pairs.push(['excerpt', data.excerpt ?? null])
  if ('sectionSummaries' in data) pairs.push(['section_summaries', jsonColumnValue(data.sectionSummaries)])
  return d1NarrowUpdate(payload, 'articles', id, pairs)
}

export type D1ArticleSkeletonInsert = {
  tenantId: number
  title: string
  slug: string
  locale: string
  siteId?: number
  authorId?: number
  categoryId?: number
  sourceBriefId?: number
  primaryKeywordId?: number
  affiliatePageLayout?: string
  pipelineProfileId?: number
  pipelineProfileSnapshot?: unknown
  pipelineProfileSlug?: string
  pipelineProfileSource?: string
  sectionSummaries?: unknown
  metaVariants?: unknown
  body: unknown
  metaTitle?: string
  metaDescription?: string
}

function numericId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim())
  return null
}

export async function d1FindArticleIdByBrief(
  payload: Payload,
  args: { briefId: number; siteId?: number },
): Promise<number | null> {
  const client = d1ClientFromPayload(payload)
  if (!client || !Number.isFinite(args.briefId)) return null
  const siteId = typeof args.siteId === 'number' && Number.isFinite(args.siteId) ? args.siteId : null
  const row = await client
    .prepare(
      'SELECT `id` FROM `articles` WHERE `source_brief_id` = ? AND (? IS NULL OR `site_id` = ?) ORDER BY `id` LIMIT 1',
    )
    .bind(args.briefId, siteId, siteId)
    .first?.<{ id?: unknown }>()
  return numericId(row?.id)
}

export async function d1NarrowInsertArticleSkeleton(
  payload: Payload,
  data: D1ArticleSkeletonInsert,
): Promise<number | null> {
  const client = d1ClientFromPayload(payload)
  if (!client) return null

  const now = new Date().toISOString()
  const columns = [
    'tenant_id',
    'title',
    'slug',
    'locale',
    'site_id',
    'body',
    'status',
    'excerpt',
    'affiliate_page_layout',
    'primary_keyword_id',
    'content_template',
    'author_id',
    'source_brief_id',
    'pipeline_profile_id',
    'pipeline_profile_snapshot',
    'pipeline_profile_slug',
    'pipeline_profile_source',
    'section_summaries',
    'meta_variants',
    'lifecycle_stage',
    'publish_queue_status',
    'publish_eligible',
    'ai_cost_usd',
    'meta_title',
    'meta_description',
    'meta_no_index',
    'updated_at',
    'created_at',
  ]
  const values = [
    data.tenantId,
    data.title,
    data.slug,
    data.locale,
    data.siteId ?? null,
    jsonColumnValue(data.body),
    'draft',
    null,
    data.affiliatePageLayout ?? 'default',
    data.primaryKeywordId ?? null,
    'howto',
    data.authorId ?? null,
    data.sourceBriefId ?? null,
    data.pipelineProfileId ?? null,
    jsonColumnValue(data.pipelineProfileSnapshot),
    data.pipelineProfileSlug ?? null,
    data.pipelineProfileSource ?? null,
    jsonColumnValue(data.sectionSummaries),
    jsonColumnValue(data.metaVariants),
    'n_a',
    'none',
    0,
    0,
    data.metaTitle ?? data.title,
    data.metaDescription ?? null,
    0,
    now,
    now,
  ]
  const placeholders = columns.map(() => '?').join(', ')
  const sql = `INSERT INTO \`articles\` (${columns.map((c) => `\`${c}\``).join(', ')}) VALUES (${placeholders}) RETURNING \`id\``
  const row = await client.prepare(sql).bind(...values).first?.<{ id?: unknown }>()
  const articleId = numericId(row?.id)
  if (articleId == null) return null

  if (typeof data.categoryId === 'number' && Number.isFinite(data.categoryId)) {
    await client
      .prepare(
        'INSERT INTO `articles_rels` (`parent_id`, `path`, `categories_id`, `order`) VALUES (?, ?, ?, ?)',
      )
      .bind(articleId, 'categories', Math.trunc(data.categoryId), 1)
      .run()
  }

  return articleId
}
