import type { Payload } from 'payload'

import {
  articleIdFromJob,
  briefIdFromJob,
  siteIdFromJob,
  type WorkflowJobDoc,
} from '@/app/api/pipeline/lib/workflowJobRunner'
import {
  canEnqueueDraftSection,
  normalizeGlobalPipelineDoc,
  snapshotPipelineMerged,
  type PipelineSettingShape,
} from '@/utilities/pipelineSettingShape'
import { compactPipelineWorkflowTags, pipelineWorkflowVariantTags } from '@/utilities/pipelineJobTags'
import type { ResolvedPipelineConfig } from '@/utilities/resolvePipelineConfig'
import { resolvePipelineConfigForArticle } from '@/utilities/resolvePipelineConfig'
import { lexicalArticleBodyToPlainText } from '@/services/writing/lexicalBodyPlain'
import { buildArticleFeaturedTogetherPromptText } from '@/utilities/togetherTenantPrompts/togetherImagePromptTemplates'
import { tenantIdFromRelation } from '@/utilities/tenantScope'
import { d1NarrowUpdate } from '@/utilities/d1NarrowUpdate'

async function articleHasExtractableFinalizePlain(payload: Payload, articleIdNum: number): Promise<boolean> {
  try {
    const articleDoc = await payload.findByID({
      collection: 'articles',
      id: String(articleIdNum),
      depth: 0,
      overrideAccess: true,
    })
    const body = (articleDoc as { body?: unknown } | null)?.body ?? null
    return lexicalArticleBodyToPlainText(body).trim().length > 0
  } catch {
    return false
  }
}

export function makeFeaturedImagePrompt(args: {
  title: string
  excerpt?: string | null
  keywordTerm?: string | null
}): string {
  return buildArticleFeaturedTogetherPromptText(args)
}

/** Standard commercial-article chain: briefs that only list intro+faq still need body + conclusion. */
const CANONICAL_SECTION_IDS = ['intro', 'body', 'faq', 'conclusion'] as const
const CANONICAL_ID_SET = new Set<string>(CANONICAL_SECTION_IDS)

export type BriefSectionSpecRow = { id: string; sectionType: string; wordBudget?: number }

function defaultSectionTypeForCanonicalId(id: string): string {
  if (id === 'intro') return 'intro'
  if (id === 'faq') return 'faq'
  if (id === 'conclusion') return 'conclusion'
  return 'custom'
}

/**
 * When every outline id ∈ {intro, body, faq, conclusion}, expand to the full ordered quad,
 * preserving existing rows and inserting defaults for missing ids.
 * Cluster / custom-slug outlines stay unchanged.
 */
export function mergeCanonicalBriefSectionRows(rows: BriefSectionSpecRow[]): BriefSectionSpecRow[] {
  if (rows.length === 0) {
    return CANONICAL_SECTION_IDS.map((id) => ({
      id,
      sectionType: defaultSectionTypeForCanonicalId(id),
    }))
  }
  const allCanonical = rows.every((r) => CANONICAL_ID_SET.has(r.id))
  if (!allCanonical) {
    return rows
  }
  const byId = new Map(rows.map((r) => [r.id, r]))
  return CANONICAL_SECTION_IDS.map((id) => {
    const existing = byId.get(id)
    if (existing) return existing
    return { id, sectionType: defaultSectionTypeForCanonicalId(id) }
  })
}

function briefOutlineSectionsNeedPersist(before: BriefSectionSpecRow[], after: BriefSectionSpecRow[]): boolean {
  if (before.length !== after.length) return true
  for (let i = 0; i < before.length; i += 1) {
    const a = before[i]
    const b = after[i]
    if (!a || !b || a.id !== b.id || a.sectionType !== b.sectionType) return true
    if ((a.wordBudget ?? null) !== (b.wordBudget ?? null)) return true
  }
  return false
}

export async function loadBriefSectionSpecs(
  payload: Payload,
  briefIdNum: number,
): Promise<Array<{ id: string; sectionType: string }>> {
  const brief = await payload.findByID({
    collection: 'content-briefs',
    id: String(briefIdNum),
    depth: 0,
    overrideAccess: true,
  })
  type Sec = { id: string; type?: string; wordBudget?: number }
  const outline = (brief as { outline?: { sections?: Sec[]; globalContext?: unknown } } | null)?.outline
  const sections = outline?.sections

  let rows: BriefSectionSpecRow[]
  if (Array.isArray(sections) && sections.length > 0) {
    rows = sections.map((s) => {
      const id = typeof s.id === 'string' ? s.id : String(s.id)
      const rawType = typeof s.type === 'string' && s.type.trim() ? s.type.trim() : ''
      return {
        id,
        sectionType: rawType || defaultSectionTypeForCanonicalId(id),
        ...(typeof s.wordBudget === 'number' && Number.isFinite(s.wordBudget) ? { wordBudget: s.wordBudget } : {}),
      }
    })
  } else {
    rows = []
  }

  const merged = mergeCanonicalBriefSectionRows(rows)
  const specsOut: Array<{ id: string; sectionType: string }> = merged.map(({ id, sectionType }) => ({
    id,
    sectionType,
  }))

  if (
    brief &&
    outline &&
    typeof outline === 'object' &&
    Array.isArray(sections) &&
    sections.length > 0 &&
    briefOutlineSectionsNeedPersist(rows, merged)
  ) {
    try {
      await payload.update({
        collection: 'content-briefs',
        id: String(briefIdNum),
        data: {
          outline: {
            ...outline,
            sections: merged.map((r) => ({
              id: r.id,
              type: r.sectionType,
              ...(typeof r.wordBudget === 'number' ? { wordBudget: r.wordBudget } : {}),
            })),
          },
        },
        overrideAccess: true,
      })
    } catch (e) {
      payload.logger.warn(
        { briefIdNum, err: e instanceof Error ? e.message : String(e) },
        '[outline] mergeCanonicalBriefSectionRows: persist skipped',
      )
    }
  }

  return specsOut
}

async function tenantIdFromSite(payload: Payload, siteId: number | null): Promise<number | null> {
  if (siteId == null || !Number.isFinite(siteId)) return null
  try {
    const s = await payload.findByID({
      collection: 'sites',
      id: siteId,
      depth: 0,
      overrideAccess: true,
    })
    return tenantIdFromRelation((s as { tenant?: number | { id: number } | null }).tenant)
  } catch {
    return null
  }
}

function parseJsonInput(job: WorkflowJobDoc): Record<string, unknown> {
  const raw = job.input
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
}

function explicitProfileIdFromInput(input: Record<string, unknown>): number | null {
  const raw = input.pipelineProfileId
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.floor(raw)
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) return Number(raw.trim())
  return null
}

async function pendingOrRunningDraftSectionFor(
  payload: Payload,
  articleIdNum: number,
  sectionId: string,
): Promise<boolean> {
  const r = await payload.find({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: 'draft_section' } },
        { article: { equals: articleIdNum } },
        { status: { in: ['pending', 'running'] } },
      ],
    },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  for (const d of r.docs) {
    const input = parseJsonInput(d as WorkflowJobDoc)
    if (input.sectionId === sectionId) return true
  }
  return false
}

/** True when merge into the article is reflected: sectionSummaries row or job output `written` (never infer from placeholder disappearance alone). */
function draftSectionMergeReflectedOnArticle(
  article: { body?: unknown; sectionSummaries?: unknown } | null,
  sectionId: string,
  out: Record<string, unknown> | undefined,
): boolean {
  if (out?.written === false) return false
  if (out?.written === true) return true
  const summaries = article?.sectionSummaries
  if (summaries && typeof summaries === 'object' && !Array.isArray(summaries)) {
    const row = (summaries as Record<string, unknown>)[sectionId]
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      const rec = row as Record<string, unknown>
      if (typeof rec.writtenAt === 'string' && rec.writtenAt.trim()) {
        const excerpt = typeof rec.excerpt === 'string' ? rec.excerpt.trim() : ''
        if (excerpt.length > 0) return true
      }
    }
  }
  return false
}

export async function successfulDraftSectionIds(
  payload: Payload,
  articleIdNum: number,
): Promise<Set<string>> {
  let article: { body?: unknown; sectionSummaries?: unknown } | null = null
  try {
    article = (await payload.findByID({
      collection: 'articles',
      id: String(articleIdNum),
      depth: 0,
      overrideAccess: true,
    })) as { body?: unknown; sectionSummaries?: unknown } | null
  } catch {
    article = null
  }

  const r = await payload.find({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: 'draft_section' } },
        { article: { equals: articleIdNum } },
        { status: { equals: 'completed' } },
      ],
    },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  const set = new Set<string>()
  for (const d of r.docs) {
    const out = d.output as Record<string, unknown> | undefined
    if (out?.ok === false) continue
    const input = parseJsonInput(d as WorkflowJobDoc)
    const sid = input.sectionId
    if (typeof sid !== 'string' || !sid) continue
    if (!draftSectionMergeReflectedOnArticle(article, sid, out)) continue
    set.add(sid)
  }
  return set
}

function finalizeJobOutputOk(doc: { output?: unknown }): boolean {
  const out = doc.output as Record<string, unknown> | undefined
  return out != null && out.ok !== false
}

async function hasSuccessfulFinalize(payload: Payload, articleIdNum: number): Promise<boolean> {
  const r = await payload.find({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: 'draft_finalize' } },
        { article: { equals: articleIdNum } },
        { status: { equals: 'completed' } },
      ],
    },
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  return r.docs.some((d) => finalizeJobOutputOk(d))
}

async function hasPendingOrRunningFinalize(payload: Payload, articleIdNum: number): Promise<boolean> {
  const r = await payload.count({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: 'draft_finalize' } },
        { article: { equals: articleIdNum } },
        { status: { in: ['pending', 'running'] } },
      ],
    },
  })
  return r.totalDocs > 0
}

async function hasPendingRunningImageGenerate(payload: Payload, articleIdNum: number): Promise<boolean> {
  const r = await payload.count({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: 'image_generate' } },
        { article: { equals: articleIdNum } },
        { status: { in: ['pending', 'running'] } },
      ],
    },
  })
  return r.totalDocs > 0
}

async function hasPendingRunningContentAudit(payload: Payload, articleIdNum: number): Promise<boolean> {
  const r = await payload.count({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: 'content_audit' } },
        { article: { equals: articleIdNum } },
        { status: { in: ['pending', 'running'] } },
      ],
    },
  })
  return r.totalDocs > 0
}

function contentAuditOutputPasses(doc: { output?: unknown }): boolean {
  const out = doc.output as Record<string, unknown> | undefined
  if (!out || out.ok === false) return false
  const verdict = typeof out.verdict === 'string' ? out.verdict : ''
  if (verdict === 'SHIP') return true
  const score = typeof out.finalOverallScore === 'number' ? out.finalOverallScore : Number(out.finalOverallScore)
  const threshold = typeof out.threshold === 'number' ? out.threshold : Number(out.threshold) || 80
  const hard = Array.isArray(out.hardVetoIds) ? out.hardVetoIds.length : 0
  return Number.isFinite(score) && score >= threshold && hard === 0
}

async function hasSuccessfulContentAudit(payload: Payload, articleIdNum: number): Promise<boolean> {
  const r = await payload.find({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: 'content_audit' } },
        { article: { equals: articleIdNum } },
        { status: { equals: 'completed' } },
      ],
    },
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  return r.docs.some((d) => contentAuditOutputPasses(d))
}

function parseSiteNumeric(jobOrSite: WorkflowJobDoc['site']): number | null {
  const s = siteIdFromJob({ site: jobOrSite } as WorkflowJobDoc)
  if (!s || !/^\d+$/.test(s)) return null
  return Number(s)
}

async function countActiveDraftSectionForArticle(
  payload: Payload,
  articleIdNum: number,
): Promise<number> {
  const r = await payload.count({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: 'draft_section' } },
        { article: { equals: articleIdNum } },
        { status: { in: ['pending', 'running'] } },
      ],
    },
  })
  return r.totalDocs
}

async function ensureArticlePipelineProfileSnapshot(
  payload: Payload,
  articleNum: number,
  resolved: ResolvedPipelineConfig,
): Promise<void> {
  const doc = await payload.findByID({
    collection: 'articles',
    id: String(articleNum),
    depth: 0,
    overrideAccess: true,
  })
  if (!doc) return
  const cur = doc as { pipelineProfileSnapshot?: unknown }
  if (cur.pipelineProfileSnapshot != null) return

  const pipelineProfileSlug =
    resolved.profileSlug != null && resolved.profileSlug.trim() ? resolved.profileSlug.trim() : null
  const updatedNarrow = await d1NarrowUpdate(payload, 'articles', articleNum, [
    ['pipeline_profile_snapshot', JSON.stringify(snapshotPipelineMerged(resolved.merged))],
    ['pipeline_profile_slug', pipelineProfileSlug],
    ['pipeline_profile_source', resolved.source],
  ])
  if (updatedNarrow) return

  await payload.update({
    collection: 'articles',
    id: String(articleNum),
    data: {
      pipelineProfileSnapshot: snapshotPipelineMerged(resolved.merged),
      ...(pipelineProfileSlug ? { pipelineProfileSlug } : {}),
      pipelineProfileSource: resolved.source,
    },
    overrideAccess: true,
  })
}

export type DraftSectionEnqueueCtx = {
  articleNum: number
  briefNum: number
  siteId: number | null
  tenantNum: number | null
  parentJobId?: number
  globalContext: string
  pipelineProfileId?: number
}

/**
 * Enqueues draft_section jobs up to `merged.sectionParallelism` / whitelist rules.
 * @returns Number of new `draft_section` jobs created.
 */
export async function enqueueAvailableDraftSectionJobs(
  payload: Payload,
  ctx: DraftSectionEnqueueCtx,
): Promise<number> {
  let pipelineProfileId = ctx.pipelineProfileId
  if (pipelineProfileId == null) {
    try {
      const article = await payload.findByID({
        collection: 'articles',
        id: String(ctx.articleNum),
        depth: 0,
        overrideAccess: true,
      })
      const pp = (article as { pipelineProfile?: number | { id: number } | null })?.pipelineProfile
      if (typeof pp === 'number' && Number.isFinite(pp)) pipelineProfileId = pp
      else if (pp && typeof pp === 'object' && 'id' in pp) {
        const id = (pp as { id: number }).id
        if (typeof id === 'number' && Number.isFinite(id)) pipelineProfileId = id
      }
    } catch {
      /* ignore */
    }
  }

  const cfgResult = await resolvePipelineConfigForArticle(
    payload,
    ctx.articleNum,
    pipelineProfileId ?? null,
  )
  let merged: PipelineSettingShape
  let wfTags: Record<string, string> = {}
  if ('ok' in cfgResult && cfgResult.ok === false) {
    const g = await payload.findGlobal({ slug: 'pipeline-settings', depth: 0 })
    merged = normalizeGlobalPipelineDoc(g as Record<string, unknown>)
  } else {
    const cfg = cfgResult as ResolvedPipelineConfig
    merged = cfg.merged
    await ensureArticlePipelineProfileSnapshot(payload, ctx.articleNum, cfg)
    wfTags = compactPipelineWorkflowTags(
      pipelineWorkflowVariantTags({
        merged: cfg.merged,
        profileSlug: cfg.profileSlug,
        source: cfg.source,
      }),
    )
  }
  const specs = await loadBriefSectionSpecs(payload, ctx.briefNum)
  const done = await successfulDraftSectionIds(payload, ctx.articleNum)
  let active = await countActiveDraftSectionForArticle(payload, ctx.articleNum)

  payload.logger.info(
    {
      articleNum: ctx.articleNum,
      briefNum: ctx.briefNum,
      pipelineProfileId: pipelineProfileId ?? null,
      sectionParallelism: merged.sectionParallelism,
      sectionVariant: merged.sectionVariant,
      whitelist: merged.sectionParallelWhitelist,
      specsCount: specs.length,
      doneCount: done.size,
      activeBefore: active,
    },
    '[chain] enqueueAvailableDraftSectionJobs start',
  )

  const parentId = ctx.parentJobId != null ? Number(ctx.parentJobId) : NaN
  let enqueuedCount = 0

  for (const row of specs) {
    const { id: sid, sectionType } = row
    if (done.has(sid)) {
      payload.logger.info(
        { sectionId: sid, sectionType, decision: 'done' as const, activeAfter: active },
        '[chain] draft_section enqueue decision',
      )
      continue
    }
    if (await pendingOrRunningDraftSectionFor(payload, ctx.articleNum, sid)) {
      payload.logger.info(
        { sectionId: sid, sectionType, decision: 'pending_or_running' as const, activeAfter: active },
        '[chain] draft_section enqueue decision',
      )
      continue
    }
    if (!canEnqueueDraftSection(merged, active, sectionType)) {
      payload.logger.info(
        { sectionId: sid, sectionType, decision: 'gated' as const, activeAfter: active },
        '[chain] draft_section enqueue decision',
      )
      continue
    }

    await payload.create({
      collection: 'workflow-jobs',
      data: {
        label: `Draft section "${sid}" → article #${ctx.articleNum}`.slice(0, 120),
        jobType: 'draft_section',
        status: 'pending',
        article: ctx.articleNum,
        contentBrief: ctx.briefNum,
        ...(ctx.siteId != null ? { site: ctx.siteId } : {}),
        ...(ctx.tenantNum != null ? { tenant: ctx.tenantNum } : {}),
        ...(Number.isFinite(parentId) ? { parentJob: parentId } : {}),
        input: {
          briefId: ctx.briefNum,
          articleId: ctx.articleNum,
          sectionId: sid,
          sectionType,
          globalContext: ctx.globalContext,
          quickWinChain: true,
          ...(pipelineProfileId != null ? { pipelineProfileId } : {}),
          ...wfTags,
        },
      },
      overrideAccess: true,
    })
    active += 1
    enqueuedCount += 1
    payload.logger.info(
      { sectionId: sid, sectionType, decision: 'enqueued' as const, activeAfter: active },
      '[chain] draft_section enqueue decision',
    )
  }

  payload.logger.info(
    { articleNum: ctx.articleNum, briefNum: ctx.briefNum, enqueuedCount },
    '[chain] enqueueAvailableDraftSectionJobs complete',
  )
  return enqueuedCount
}

/**
 * After each draft_section completes: fill parallel slots with remaining outline sections.
 */
export async function enqueueMoreDraftSectionsAfterCompletion(
  payload: Payload,
  doc: WorkflowJobDoc,
): Promise<void> {
  const aid = articleIdFromJob(doc)
  const bid = briefIdFromJob(doc)
  const articleNum = aid != null && /^\d+$/.test(aid) ? Number(aid) : NaN
  const briefNum = bid != null && /^\d+$/.test(bid) ? Number(bid) : NaN
  if (!Number.isFinite(articleNum) || !Number.isFinite(briefNum)) return

  const siteNum = parseSiteNumeric(doc.site)
  const tenantNum = await tenantIdFromSite(payload, siteNum)
  const input = parseJsonInput(doc)
  let globalContext =
    typeof input.globalContext === 'string' && input.globalContext.trim()
      ? input.globalContext.trim().slice(0, 12000)
      : ''
  if (!globalContext) {
    try {
      const article = await payload.findByID({
        collection: 'articles',
        id: String(articleNum),
        depth: 0,
        overrideAccess: true,
      })
      const sm = (article as { sectionSummaries?: Record<string, unknown> }).sectionSummaries
      const raw = sm && typeof sm === 'object' && typeof sm.globalContext === 'string' ? sm.globalContext : ''
      if (raw.trim()) globalContext = raw.trim().slice(0, 12000)
    } catch {
      /* ignore */
    }
  }

  let pipelineProfileId: number | undefined
  if (typeof input.pipelineProfileId === 'number' && Number.isFinite(input.pipelineProfileId)) {
    pipelineProfileId = Math.floor(input.pipelineProfileId)
  } else if (typeof input.pipelineProfileId === 'string' && /^\d+$/.test(input.pipelineProfileId.trim())) {
    pipelineProfileId = Number(input.pipelineProfileId.trim())
  }

  await enqueueAvailableDraftSectionJobs(payload, {
    articleNum,
    briefNum,
    siteId: siteNum,
    tenantNum,
    globalContext,
    pipelineProfileId,
  })
}

/**
 * After draft_skeleton succeeds: enqueue draft_section jobs (respects parallelism / whitelist).
 * @returns Number of `draft_section` jobs created; 0 if ids invalid or nothing enqueued.
 */
export async function enqueueDraftSectionsAfterSkeleton(
  payload: Payload,
  args: {
    completedSkeletonJobId: string | number
    articleId: unknown
    briefId: unknown
    siteNumeric: number | null
    tenantNumeric?: number | null
    globalContextFallback?: string
  },
): Promise<number> {
  payload.logger.info(
    {
      rawArticleId: args.articleId,
      rawBriefId: args.briefId,
      completedSkeletonJobId: args.completedSkeletonJobId,
      siteNumeric: args.siteNumeric,
    },
    '[chain] enqueueDraftSectionsAfterSkeleton input',
  )

  const articleNum =
    typeof args.articleId === 'number'
      ? args.articleId
      : typeof args.articleId === 'string' && /^\d+$/.test(args.articleId)
        ? Number(args.articleId)
        : Number.NaN
  const briefNum =
    typeof args.briefId === 'number'
      ? args.briefId
      : typeof args.briefId === 'string' && /^\d+$/.test(args.briefId)
        ? Number(args.briefId)
        : Number.NaN
  if (!Number.isFinite(articleNum) || !Number.isFinite(briefNum)) {
    payload.logger.warn(
      { articleNum, briefNum, rawArticleId: args.articleId, rawBriefId: args.briefId },
      '[chain] enqueueDraftSectionsAfterSkeleton skipped: article/brief id non-numeric',
    )
    return 0
  }

  const siteId = args.siteNumeric ?? null
  let tenantNum = args.tenantNumeric ?? null
  if (tenantNum == null && siteId != null) {
    tenantNum = await tenantIdFromSite(payload, siteId)
  }

  let pipelineProfileId: number | undefined
  try {
    const article = await payload.findByID({
      collection: 'articles',
      id: String(articleNum),
      depth: 0,
      overrideAccess: true,
    })
    const pp = (article as { pipelineProfile?: number | { id: number } | null })?.pipelineProfile
    if (typeof pp === 'number' && Number.isFinite(pp)) pipelineProfileId = pp
    else if (pp && typeof pp === 'object' && 'id' in pp) {
      const id = (pp as { id: number }).id
      if (typeof id === 'number' && Number.isFinite(id)) pipelineProfileId = id
    }
  } catch {
    /* ignore */
  }

  let globalContext =
    typeof args.globalContextFallback === 'string' && args.globalContextFallback.trim()
      ? args.globalContextFallback.trim().slice(0, 12000)
      : ''
  if (!globalContext) {
    try {
      const article = await payload.findByID({
        collection: 'articles',
        id: String(articleNum),
        depth: 0,
        overrideAccess: true,
      })
      const sm = (article as { sectionSummaries?: Record<string, unknown> }).sectionSummaries
      const raw = sm && typeof sm === 'object' && typeof sm.globalContext === 'string' ? sm.globalContext : ''
      if (raw.trim()) globalContext = raw.trim().slice(0, 12000)
    } catch {
      /* ignore */
    }
  }

  const parentId = Number(args.completedSkeletonJobId)

  return await enqueueAvailableDraftSectionJobs(payload, {
    articleNum,
    briefNum,
    siteId,
    tenantNum,
    ...(Number.isFinite(parentId) ? { parentJobId: parentId } : {}),
    globalContext,
    pipelineProfileId,
  })
}

/**
 * After a draft_section completes: if every outline section has a successful job, enqueue exactly one draft_finalize.
 */
export async function enqueueDraftFinalizeIfSectionsDone(
  payload: Payload,
  doc: WorkflowJobDoc,
): Promise<void> {
  const aid = articleIdFromJob(doc)
  const bid = briefIdFromJob(doc)
  const articleNum = aid != null && /^\d+$/.test(aid) ? Number(aid) : NaN
  const briefNum = bid != null && /^\d+$/.test(bid) ? Number(bid) : NaN
  if (!Number.isFinite(articleNum) || !Number.isFinite(briefNum)) return

  const expected = await loadBriefSectionSpecs(payload, briefNum)
  const done = await successfulDraftSectionIds(payload, articleNum)
  const allDone = expected.every((e) => done.has(e.id))
  if (!allDone) return

  if (await hasPendingOrRunningFinalize(payload, articleNum)) return
  if (await hasSuccessfulFinalize(payload, articleNum)) return

  if (!(await articleHasExtractableFinalizePlain(payload, articleNum))) {
    payload.logger.warn(
      { articleNum, briefNum },
      '[pipeline] skip draft_finalize enqueue: article body has no extractable plain text (would 422)',
    )
    return
  }

  const siteNum = parseSiteNumeric(doc.site)
  const tenantNum = await tenantIdFromSite(payload, siteNum)

  const input = parseJsonInput(doc)
  const ppExplicit = explicitProfileIdFromInput(input)
  const cfgFin = await resolvePipelineConfigForArticle(payload, articleNum, ppExplicit)
  const wfFinalize =
    'ok' in cfgFin && cfgFin.ok === false ?
      {}
    : compactPipelineWorkflowTags(
        pipelineWorkflowVariantTags({
          merged: (cfgFin as ResolvedPipelineConfig).merged,
          profileSlug: (cfgFin as ResolvedPipelineConfig).profileSlug,
          source: (cfgFin as ResolvedPipelineConfig).source,
        }),
      )

  await payload.create({
    collection: 'workflow-jobs',
    data: {
      label: `Draft finalize → article #${articleNum}`.slice(0, 120),
      jobType: 'draft_finalize',
      status: 'pending',
      article: articleNum,
      contentBrief: briefNum,
      ...(siteNum != null ? { site: siteNum } : {}),
      ...(tenantNum != null ? { tenant: tenantNum } : {}),
      input: { articleId: articleNum, briefId: briefNum, quickWinChain: true, ...wfFinalize },
    },
    overrideAccess: true,
  })
}

/**
 * Effective `togetherImageEnabled` for an article-scoped workflow job (e.g. `image_generate`, `draft_finalize`).
 * When the article id cannot be resolved, returns true so dispatch can still run (route enforces the flag).
 */
export async function resolveTogetherImageEnabledForArticleJob(
  payload: Payload,
  doc: WorkflowJobDoc,
): Promise<boolean> {
  const aid = articleIdFromJob(doc)
  const articleNum = aid != null && /^\d+$/.test(aid) ? Number(aid) : NaN
  if (!Number.isFinite(articleNum)) return true
  const ppExplicit = explicitProfileIdFromInput(parseJsonInput(doc))
  const cfg = await resolvePipelineConfigForArticle(payload, articleNum, ppExplicit)
  if ('ok' in cfg && cfg.ok === false) {
    const g = await payload.findGlobal({ slug: 'pipeline-settings', depth: 0 })
    return normalizeGlobalPipelineDoc(g as Record<string, unknown>).togetherImageEnabled
  }
  return (cfg as ResolvedPipelineConfig).merged.togetherImageEnabled
}

/**
 * After draft_finalize completes: run the 80+ quality gate before downstream image/publish-ready steps.
 */
export async function enqueueContentAuditIfNeeded(
  payload: Payload,
  doc: WorkflowJobDoc,
): Promise<void> {
  const aid = articleIdFromJob(doc)
  const articleNum = aid != null && /^\d+$/.test(aid) ? Number(aid) : NaN
  if (!Number.isFinite(articleNum)) return

  if (await hasPendingRunningContentAudit(payload, articleNum)) return
  if (await hasSuccessfulContentAudit(payload, articleNum)) return

  const article = await payload.findByID({
    collection: 'articles',
    id: String(articleNum),
    depth: 0,
    overrideAccess: true,
  })
  if (!article) return

  const siteRaw = (article as { site?: number | { id: number } | null }).site
  const siteNum =
    typeof siteRaw === 'object' && siteRaw?.id != null ? siteRaw.id : typeof siteRaw === 'number' ? siteRaw : null
  const tenantNum =
    tenantIdFromRelation((article as { tenant?: number | { id: number } | null }).tenant) ??
    (await tenantIdFromSite(payload, siteNum ?? null))

  const input = parseJsonInput(doc)
  const ppExplicit = explicitProfileIdFromInput(input)
  const cfgAudit = await resolvePipelineConfigForArticle(payload, articleNum, ppExplicit)
  const wfAudit =
    'ok' in cfgAudit && cfgAudit.ok === false ?
      {}
    : compactPipelineWorkflowTags(
        pipelineWorkflowVariantTags({
          merged: (cfgAudit as ResolvedPipelineConfig).merged,
          profileSlug: (cfgAudit as ResolvedPipelineConfig).profileSlug,
          source: (cfgAudit as ResolvedPipelineConfig).source,
        }),
      )

  await payload.create({
    collection: 'workflow-jobs',
    data: {
      label: `Content audit 80+ → article #${articleNum}`.slice(0, 120),
      jobType: 'content_audit',
      status: 'pending',
      article: articleNum,
      ...(siteNum != null && Number.isFinite(siteNum) ? { site: siteNum } : {}),
      ...(tenantNum != null ? { tenant: tenantNum } : {}),
      input: {
        articleId: articleNum,
        quickWinChain: true,
        ...wfAudit,
      },
    },
    overrideAccess: true,
  })
}

/**
 * After draft_finalize completes: enqueue image_generate if article has no featured image yet.
 */
export async function enqueueImageGenerateIfNeeded(
  payload: Payload,
  doc: WorkflowJobDoc,
): Promise<void> {
  const aid = articleIdFromJob(doc)
  const articleNum = aid != null && /^\d+$/.test(aid) ? Number(aid) : NaN
  if (!Number.isFinite(articleNum)) return

  if (!(await resolveTogetherImageEnabledForArticleJob(payload, doc))) return

  if (await hasPendingRunningImageGenerate(payload, articleNum)) return

  const article = await payload.findByID({
    collection: 'articles',
    id: String(articleNum),
    depth: 1,
    overrideAccess: true,
  })
  if (!article) return
  const fi = (article as { featuredImage?: number | { id: number } | null }).featuredImage
  if (fi != null) return

  const title =
    typeof (article as { title?: string }).title === 'string' ? (article as { title: string }).title : 'Article'
  const excerpt =
    typeof (article as { excerpt?: string }).excerpt === 'string' ? (article as { excerpt: string }).excerpt : ''
  let keywordTerm = ''
  const pk = (article as { primaryKeyword?: { term?: string } | number }).primaryKeyword
  if (pk && typeof pk === 'object' && typeof pk.term === 'string') keywordTerm = pk.term

  const prompt = makeFeaturedImagePrompt({
    title,
    excerpt,
    keywordTerm,
  })

  const siteRaw = (article as { site?: number | { id: number } | null }).site
  const siteNum =
    typeof siteRaw === 'object' && siteRaw?.id != null ? siteRaw.id : typeof siteRaw === 'number' ? siteRaw : null
  const tenantNum =
    tenantIdFromRelation((article as { tenant?: number | { id: number } | null }).tenant) ??
    (await tenantIdFromSite(payload, siteNum ?? null))

  await payload.create({
    collection: 'workflow-jobs',
    data: {
      label: `Featured image → article #${articleNum}`.slice(0, 120),
      jobType: 'image_generate',
      status: 'pending',
      article: articleNum,
      ...(siteNum != null && Number.isFinite(siteNum) ? { site: siteNum } : {}),
      ...(tenantNum != null ? { tenant: tenantNum } : {}),
      input: {
        prompt,
        articleId: articleNum,
        siteId: siteNum ?? undefined,
        asFeatured: true,
        quickWinChain: true,
      },
    },
    overrideAccess: true,
  })
}

/** Mark article as pipeline-complete (draft stays draft). */
export async function markArticlePublishReady(payload: Payload, articleIdNum: number): Promise<void> {
  if (!Number.isFinite(articleIdNum)) return
  const doc = await payload.findByID({
    collection: 'articles',
    id: String(articleIdNum),
    depth: 0,
    overrideAccess: true,
  })
  if (!doc) return
  const hist = Array.isArray((doc as { optimizationHistory?: unknown }).optimizationHistory)
    ? [...((doc as { optimizationHistory: Record<string, unknown>[] }).optimizationHistory)]
    : []
  hist.push({
    date: new Date().toISOString(),
    action: 'auto_pipeline_done',
    cost: 0,
    note: 'brief→skeleton→sections→finalize→image (status left draft)',
  })
  await payload.update({
    collection: 'articles',
    id: String(articleIdNum),
    data: { optimizationHistory: hist },
    overrideAccess: true,
  })
}

/**
 * Catch-up: enqueue missing stages for an existing article linked to sourceBrief.
 */
export async function enqueueArticlePipelineCatchup(
  payload: Payload,
  articleIdNum: number,
): Promise<{ ok: true; messages: string[] } | { ok: false; error: string }> {
  const messages: string[] = []
  const article = await payload.findByID({
    collection: 'articles',
    id: String(articleIdNum),
    depth: 0,
    overrideAccess: true,
  })
  if (!article) return { ok: false, error: 'article_not_found' }

  const srcBrief = (article as { sourceBrief?: number | { id: number } | null }).sourceBrief
  const briefNum =
    typeof srcBrief === 'object' && srcBrief?.id != null
      ? srcBrief.id
      : typeof srcBrief === 'number' && Number.isFinite(srcBrief)
        ? srcBrief
        : null
  if (briefNum == null) return { ok: false, error: 'article_missing_sourceBrief' }

  const siteRaw = (article as { site?: number | { id: number } | null }).site
  const siteNum =
    typeof siteRaw === 'object' && siteRaw?.id != null ? siteRaw.id : typeof siteRaw === 'number' ? siteRaw : null
  let tenantNum = tenantIdFromRelation((article as { tenant?: number | { id: number } | null }).tenant)
  if (tenantNum == null && siteNum != null) {
    tenantNum = await tenantIdFromSite(payload, siteNum)
  }

  const sm = (article as { sectionSummaries?: Record<string, unknown> }).sectionSummaries
  const globalContext =
    sm && typeof sm === 'object' && typeof sm.globalContext === 'string' ? sm.globalContext.slice(0, 12000) : ''

  const pendingBefore = await payload.count({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: 'draft_section' } },
        { article: { equals: articleIdNum } },
        { status: { equals: 'pending' } },
      ],
    },
  })

  await enqueueAvailableDraftSectionJobs(payload, {
    articleNum: articleIdNum,
    briefNum,
    siteId: siteNum,
    tenantNum,
    globalContext,
  })

  const pendingAfter = await payload.count({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: 'draft_section' } },
        { article: { equals: articleIdNum } },
        { status: { equals: 'pending' } },
      ],
    },
  })
  const createdSections = Math.max(0, pendingAfter.totalDocs - pendingBefore.totalDocs)
  if (createdSections > 0) messages.push(`入队 draft_section × ${createdSections}`)

  const doneAfter = await successfulDraftSectionIds(payload, articleIdNum)
  const specs = await loadBriefSectionSpecs(payload, briefNum)
  const allSectionsDone = specs.every((e) => doneAfter.has(e.id))

  if (
    allSectionsDone &&
    !(await hasSuccessfulFinalize(payload, articleIdNum)) &&
    !(await hasPendingOrRunningFinalize(payload, articleIdNum))
  ) {
    if (!(await articleHasExtractableFinalizePlain(payload, articleIdNum))) {
      payload.logger.warn(
        { articleIdNum, briefNum },
        '[pipeline] catchup skip draft_finalize: article body has no extractable plain text (would 422)',
      )
    } else {
      const cfgCu = await resolvePipelineConfigForArticle(payload, articleIdNum, null)
      const wfCu =
        'ok' in cfgCu && cfgCu.ok === false ?
          {}
        : compactPipelineWorkflowTags(
            pipelineWorkflowVariantTags({
              merged: (cfgCu as ResolvedPipelineConfig).merged,
              profileSlug: (cfgCu as ResolvedPipelineConfig).profileSlug,
              source: (cfgCu as ResolvedPipelineConfig).source,
            }),
          )

      await payload.create({
        collection: 'workflow-jobs',
        data: {
          label: `[catchup] draft_finalize → article #${articleIdNum}`,
          jobType: 'draft_finalize',
          status: 'pending',
          article: articleIdNum,
          contentBrief: briefNum,
          ...(siteNum != null ? { site: siteNum } : {}),
          ...(tenantNum != null ? { tenant: tenantNum } : {}),
          input: {
            articleId: articleIdNum,
            briefId: briefNum,
            quickWinCatchup: true,
            ...wfCu,
          },
        },
        overrideAccess: true,
      })
      messages.push('入队 draft_finalize × 1')
    }
  }

  const fiReload = await payload.findByID({
    collection: 'articles',
    id: String(articleIdNum),
    depth: 0,
    overrideAccess: true,
  })
  const featuredMissing =
    fiReload && (fiReload as { featuredImage?: number | null }).featuredImage == null

  const finalizedJobs = await payload.find({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: 'draft_finalize' } },
        { article: { equals: articleIdNum } },
        { status: { equals: 'completed' } },
      ],
    },
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  const hasGoodFinalize =
    finalizedJobs.docs.some((d) => finalizeJobOutputOk(d as { output?: unknown }))

  if (
    hasGoodFinalize &&
    !(await hasSuccessfulContentAudit(payload, articleIdNum)) &&
    !(await hasPendingRunningContentAudit(payload, articleIdNum))
  ) {
    await enqueueContentAuditIfNeeded(payload, {
      id: 0,
      jobType: 'draft_finalize',
      site: siteNum != null ? siteNum : undefined,
      article: articleIdNum,
      input: {},
    } as WorkflowJobDoc)
    messages.push('入队 content_audit × 1')
  }

  if (
    featuredMissing &&
    (await hasSuccessfulContentAudit(payload, articleIdNum)) &&
    !(await hasPendingRunningImageGenerate(payload, articleIdNum))
  ) {
    await enqueueImageGenerateIfNeeded(payload, {
      id: 0,
      jobType: 'content_audit',
      site: siteNum != null ? siteNum : undefined,
      article: articleIdNum,
      input: {},
    } as WorkflowJobDoc)
    messages.push('入队 image_generate × 1')
  }

  if (messages.length === 0) {
    messages.push('未发现需补入队的任务（可能已全部完成或已有 pending/running 任务）')
  }

  return { ok: true, messages }
}
