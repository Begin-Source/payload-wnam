import configPromise from '@payload-config'
import type { Payload, Where } from 'payload'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { planArticleTriage } from '@/utilities/articleLifecycleTriage'
import { needsMoneyPageReinforce } from '@/utilities/moneyPageLinkRules'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/triage'

type ArticleDoc = {
  id: string | number
  title: string
  lifecycleStage?: string
  contentTemplate?: string | null
  publishedAt?: string | null
  bestPosition?: number | null
  currentPosition?: number | null
  impressions30d?: number | null
  clicks30d?: number | null
  optimizationHistory?: unknown
  site?: string | { id: string | number }
  primaryKeyword?: string | { id: string | number; pillar?: string | { id: string | number } | null } | null
}

type RankingDoc = {
  id: string | number
  serpPosition?: number | null
  capturedAt: string
  isAiOverviewHit?: boolean | null
}

function siteIdOf(site: ArticleDoc['site']): string | null {
  if (!site) return null
  return typeof site === 'string' ? site : String(site.id)
}

function relationNumeric(id: string | number | null | undefined): number | undefined {
  if (id == null) return undefined
  const n = typeof id === 'number' ? id : Number(id)
  return Number.isFinite(n) ? n : undefined
}

function keywordIdOf(kw: ArticleDoc['primaryKeyword']): string | null {
  if (!kw) return null
  return typeof kw === 'string' ? kw : String(kw.id)
}

function appendHistory(doc: ArticleDoc, entry: Record<string, unknown>): unknown[] {
  const h = doc.optimizationHistory
  const list = Array.isArray(h) ? [...h] : []
  list.push(entry)
  return list
}

async function countFreshBodyInlinks(
  payload: Payload,
  siteId: string,
  articleId: string | number,
): Promise<number> {
  const since = new Date()
  since.setDate(since.getDate() - 30)
  const sinceIso = since.toISOString()
  const c = await payload.count({
    collection: 'page-link-graph',
    where: {
      and: [
        { site: { equals: siteId } },
        { toId: { equals: String(articleId) } },
        { toCollection: { equals: 'articles' } },
        { location: { equals: 'body' } },
        { lastSeenAt: { greater_than: sinceIso } },
      ],
    },
  })
  return c.totalDocs
}

async function pendingJobExists(
  payload: Payload,
  articleId: string | number,
  jobType: string,
): Promise<boolean> {
  const aid = relationNumeric(articleId)
  const r = await payload.count({
    collection: 'workflow-jobs',
    where: {
      and: [
        { status: { equals: 'pending' } },
        { jobType: { equals: jobType } },
        ...(aid != null ? [{ article: { equals: aid } }] : []),
      ],
    },
  })
  return r.totalDocs > 0
}

/**
 * Cluster keyword → published pillar-target article (same site, strong enough to merge into).
 */
async function findPillarArticleForMerge(
  payload: Payload,
  article: ArticleDoc,
  keyword: Exclude<ArticleDoc['primaryKeyword'], string | null | undefined>,
): Promise<string | null> {
  const site = siteIdOf(article.site)
  if (!site) return null
  const pillarRef = keyword.pillar
  const pillarId =
    typeof pillarRef === 'object' && pillarRef && 'id' in pillarRef
      ? pillarRef.id
      : typeof pillarRef === 'string'
        ? pillarRef
        : null
  if (!pillarId) return null

  const res = await payload.find({
    collection: 'articles',
    where: {
      and: [
        { id: { not_equals: article.id } },
        { site: { equals: site } },
        { status: { equals: 'published' } },
        { primaryKeyword: { equals: pillarId } },
      ],
    },
    limit: 5,
    sort: 'bestPosition',
    depth: 0,
  })
  for (const d of res.docs) {
    const a = d as unknown as { id: string | number; bestPosition?: number | null; lifecycleStage?: string }
    const bp = a.bestPosition ?? 99
    if (bp <= 15) return String(a.id)
  }
  const first = res.docs[0] as unknown as { id: string | number } | undefined
  return first != null ? String(first.id) : null
}

async function latestRankings(
  payload: Payload,
  siteId: string,
  keywordId: string,
): Promise<RankingDoc[]> {
  const res = await payload.find({
    collection: 'rankings',
    where: {
      and: [{ site: { equals: siteId } }, { keyword: { equals: keywordId } }],
    },
    sort: '-capturedAt',
    limit: 2,
    depth: 0,
  })
  return res.docs as unknown as RankingDoc[]
}

function stableDaysFromRankings(docs: RankingDoc[]): number | null {
  if (docs.length < 2) return null
  const [a, b] = docs
  const pa = a.serpPosition
  const pb = b.serpPosition
  if (pa == null || pb == null || pa !== pb) return 0
  const t0 = new Date(a.capturedAt).getTime()
  const t1 = new Date(b.capturedAt).getTime()
  return Math.max(0, Math.round((t0 - t1) / 86400000))
}

export async function GET(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const payload = await getPayload({ config: configPromise })
  const stages = [
    'n_a',
    'probation',
    'winner',
    'borderline',
    'loser',
    'stable_watch',
    'repaired',
    'dying',
    'merged',
    'archived',
  ] as const
  const counts: Record<string, number> = {}
  for (const s of stages) {
    const c = await payload.count({
      collection: 'articles',
      where: {
        and: [{ status: { equals: 'published' } }, { lifecycleStage: { equals: s } }],
      },
    })
    counts[s] = c.totalDocs
  }
  return Response.json({ ok: true, path: PATH, publishedByLifecycleStage: counts })
}

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as {
    dryRun?: boolean
    siteId?: string
    limit?: number
  }
  const dryRun = Boolean(body.dryRun)
  const limit = Math.min(Math.max(body.limit ?? 200, 1), 500)

  const payload = await getPayload({ config: configPromise })

  const andClause: Where[] = [
    { status: { equals: 'published' } },
    {
      or: [
        { lifecycleStage: { equals: 'probation' } },
        { lifecycleStage: { equals: 'winner' } },
        { lifecycleStage: { equals: 'borderline' } },
      ],
    },
  ]
  if (body.siteId) {
    andClause.push({ site: { equals: body.siteId } })
  }
  const where: Where = { and: andClause }

  const articles = await payload.find({
    collection: 'articles',
    where,
    limit,
    depth: 2,
    sort: '-updatedAt',
  })

  let updated = 0
  let jobsCreated = 0
  const samples: Record<string, unknown>[] = []

  const runMoneyPagePass = async (): Promise<{ scanned: number; jobs: number }> => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 14)
    const cutoffIso = cutoff.toISOString()
    const mpWhere: Where[] = [
      { status: { equals: 'published' } },
      { contentTemplate: { in: ['review', 'comparison', 'buyingGuide'] } },
      { publishedAt: { less_than: cutoffIso } },
      {
        or: [
          { lifecycleStage: { equals: 'probation' } },
          { lifecycleStage: { equals: 'winner' } },
          { lifecycleStage: { equals: 'borderline' } },
        ],
      },
    ]
    if (body.siteId) {
      mpWhere.push({ site: { equals: body.siteId } })
    }
    const moneyArticles = await payload.find({
      collection: 'articles',
      where: { and: mpWhere } as Where,
      limit,
      depth: 0,
      sort: '-publishedAt',
    })
    let jobs = 0
    for (const raw of moneyArticles.docs) {
      const a = raw as unknown as ArticleDoc
      const site = siteIdOf(a.site)
      if (!site) continue
      const n = await countFreshBodyInlinks(payload, site, a.id)
      if (
        !needsMoneyPageReinforce({
          contentTemplate: a.contentTemplate,
          publishedAt: a.publishedAt ?? null,
          lifecycleStage: a.lifecycleStage ?? null,
          bodyInlinkCount: n,
        })
      ) {
        continue
      }
      if (await pendingJobExists(payload, a.id, 'internal_link_reinforce')) {
        continue
      }
      if (!dryRun) {
        const siteNum = relationNumeric(site)
        const artNum = relationNumeric(a.id)
        if (siteNum != null && artNum != null) {
          await payload.create({
            collection: 'workflow-jobs',
            data: {
              label: `Money page inlinks: ${a.title}`.slice(0, 120),
              jobType: 'internal_link_reinforce',
              status: 'pending',
              site: siteNum,
              article: artNum,
              input: {
                reason: 'money_page_low_body_inlinks',
                articleId: a.id,
                bodyInlinkCount: n,
              },
            },
          })
          jobs += 1
        }
      }
    }
    return { scanned: moneyArticles.docs.length, jobs }
  }

  for (const raw of articles.docs) {
    const article = raw as unknown as ArticleDoc
    const site = siteIdOf(article.site)
    const kwId = keywordIdOf(article.primaryKeyword)
    if (!site || !kwId) {
      samples.push({ articleId: article.id, skip: 'missing_site_or_primary_keyword' })
      continue
    }

    const rankings = await latestRankings(payload, site, kwId)
    const latest = rankings[0]
    const newPos = latest?.serpPosition ?? null
    const prevPos = article.currentPosition ?? article.bestPosition ?? null
    const stableDays = stableDaysFromRankings(rankings)

    const kw = article.primaryKeyword
    const mergeTargetId =
      kw && typeof kw === 'object' ? await findPillarArticleForMerge(payload, article, kw) : null
    const hasMergeTarget = Boolean(mergeTargetId)

    const stage = (article.lifecycleStage ?? 'n_a') as Parameters<typeof planArticleTriage>[0]['currentStage']

    const plan = planArticleTriage({
      currentStage: stage,
      prevPosition: prevPos,
      newPosition: newPos,
      bestPosition: article.bestPosition ?? null,
      stableDays,
      hasMergeTarget,
      isAiOverviewHit: Boolean(latest?.isAiOverviewHit),
      clicks30d: article.clicks30d ?? null,
      impressions30d: article.impressions30d ?? null,
    })

    const shouldAppendHistory = plan.persistHistory

    const patch: Record<string, unknown> = {}
    if (plan.nextCurrentPosition != null) {
      patch.currentPosition = plan.nextCurrentPosition
    }
    if (plan.nextBestPosition != null) {
      patch.bestPosition = plan.nextBestPosition
    }
    if (plan.nextStage) {
      patch.lifecycleStage = plan.nextStage
    }
    if (plan.nextActionAt) {
      patch.nextActionAt = plan.nextActionAt.toISOString()
    }
    if (shouldAppendHistory) {
      patch.optimizationHistory = appendHistory(article, plan.historyEntry)
    }

    const hasArticlePatch = Object.keys(patch).length > 0

    if (!dryRun) {
      if (hasArticlePatch) {
        await payload.update({
          collection: 'articles',
          id: article.id,
          data: patch,
        })
        updated += 1
      }

      for (const job of plan.jobs) {
        if (await pendingJobExists(payload, article.id, job.jobType)) {
          continue
        }
        const siteNum = relationNumeric(site)
        const artNum = relationNumeric(article.id)
        if (siteNum == null || artNum == null) {
          continue
        }
        await payload.create({
          collection: 'workflow-jobs',
          data: {
            label: `Triage ${job.jobType}: ${article.title}`.slice(0, 120),
            jobType: job.jobType,
            status: 'pending',
            site: siteNum,
            article: artNum,
            input: {
              ...job.input,
              articleId: article.id,
              mergeTargetArticleId: mergeTargetId,
            },
          },
        })
        jobsCreated += 1
      }
    } else {
      samples.push({
        articleId: article.id,
        plan: {
          nextStage: plan.nextStage,
          jobs: plan.jobs,
          newPos,
          prevPos,
        },
      })
    }
  }

  const moneyPass = await runMoneyPagePass()
  jobsCreated += moneyPass.jobs

  return Response.json({
    ok: true,
    dryRun,
    scanned: articles.docs.length,
    moneyPagePass: { scanned: moneyPass.scanned, jobsCreated: moneyPass.jobs },
    updated,
    jobsCreated,
    samples: dryRun ? samples.slice(0, 20) : undefined,
  })
}
