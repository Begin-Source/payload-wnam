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
import { buildArticleFeaturedTogetherPromptText } from '@/utilities/togetherTenantPrompts/togetherImagePromptTemplates'
import { tenantIdFromRelation } from '@/utilities/tenantScope'

export function makeFeaturedImagePrompt(args: {
  title: string
  excerpt?: string | null
  keywordTerm?: string | null
}): string {
  return buildArticleFeaturedTogetherPromptText(args)
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
  type Sec = { id: string; type?: string }
  const outline = (brief as { outline?: { sections?: Sec[] } } | null)?.outline
  const sections = outline?.sections
  if (Array.isArray(sections) && sections.length > 0) {
    return sections.map((s) => ({
      id: typeof s.id === 'string' ? s.id : String(s.id),
      sectionType: typeof s.type === 'string' && s.type.trim() ? s.type : 'custom',
    }))
  }
  return ['intro', 'body', 'faq', 'conclusion'].map((id) => ({
    id,
    sectionType: id === 'faq' ? 'faq' : 'custom',
  }))
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

export async function successfulDraftSectionIds(
  payload: Payload,
  articleIdNum: number,
): Promise<Set<string>> {
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
    if (typeof sid === 'string' && sid) set.add(sid)
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

  await payload.update({
    collection: 'articles',
    id: String(articleNum),
    data: {
      pipelineProfileSnapshot: snapshotPipelineMerged(resolved.merged),
      ...(resolved.profileSlug != null && resolved.profileSlug.trim() ?
        { pipelineProfileSlug: resolved.profileSlug.trim() }
      : {}),
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
 */
export async function enqueueAvailableDraftSectionJobs(
  payload: Payload,
  ctx: DraftSectionEnqueueCtx,
): Promise<void> {
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

  const parentId = ctx.parentJobId != null ? Number(ctx.parentJobId) : NaN

  for (const row of specs) {
    const { id: sid, sectionType } = row
    if (done.has(sid)) continue
    if (await pendingOrRunningDraftSectionFor(payload, ctx.articleNum, sid)) continue
    if (!canEnqueueDraftSection(merged, active, sectionType)) break

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
  }
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
): Promise<void> {
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
  if (!Number.isFinite(articleNum) || !Number.isFinite(briefNum)) return

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

  await enqueueAvailableDraftSectionJobs(payload, {
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
 * After draft_finalize completes: enqueue image_generate if article has no featured image yet.
 */
export async function enqueueImageGenerateIfNeeded(
  payload: Payload,
  doc: WorkflowJobDoc,
): Promise<void> {
  const aid = articleIdFromJob(doc)
  const articleNum = aid != null && /^\d+$/.test(aid) ? Number(aid) : NaN
  if (!Number.isFinite(articleNum)) return

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

  if (featuredMissing && hasGoodFinalize && !(await hasPendingRunningImageGenerate(payload, articleIdNum))) {
    await enqueueImageGenerateIfNeeded(payload, {
      id: 0,
      jobType: 'draft_finalize',
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
