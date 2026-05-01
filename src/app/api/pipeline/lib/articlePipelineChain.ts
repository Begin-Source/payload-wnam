import type { Payload } from 'payload'

import {
  articleIdFromJob,
  briefIdFromJob,
  siteIdFromJob,
  type WorkflowJobDoc,
} from '@/app/api/pipeline/lib/workflowJobRunner'
import { tenantIdFromRelation } from '@/utilities/tenantScope'

export function makeFeaturedImagePrompt(args: {
  title: string
  excerpt?: string | null
  keywordTerm?: string | null
}): string {
  const tail = [args.excerpt ?? '', args.keywordTerm ?? ''].join(' ').trim()
  return (
    `Editorial blog hero image, no readable text overlays, cinematic lighting. Topic: "${args.title.trim()}". ${tail}`.trim()
  ).slice(0, 2000)
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

/**
 * After draft_skeleton succeeds: enqueue one draft_section job per outline section (dedup).
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

  const specs = await loadBriefSectionSpecs(payload, briefNum)
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

  for (const row of specs) {
    const { id: sid, sectionType } = row
    if (await pendingOrRunningDraftSectionFor(payload, articleNum, sid)) continue

    await payload.create({
      collection: 'workflow-jobs',
      data: {
        label: `Draft section "${sid}" → article #${articleNum}`.slice(0, 120),
        jobType: 'draft_section',
        status: 'pending',
        article: articleNum,
        contentBrief: briefNum,
        ...(siteId != null ? { site: siteId } : {}),
        ...(tenantNum != null ? { tenant: tenantNum } : {}),
        ...(Number.isFinite(parentId) ? { parentJob: parentId } : {}),
        input: {
          briefId: briefNum,
          articleId: articleNum,
          sectionId: sid,
          sectionType,
          globalContext,
          quickWinChain: true,
        },
      },
      overrideAccess: true,
    })
  }
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
      input: { articleId: articleNum, briefId: briefNum, quickWinChain: true },
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

  const specs = await loadBriefSectionSpecs(payload, briefNum)
  const secDone = await successfulDraftSectionIds(payload, articleIdNum)
  let createdSections = 0
  const sm = (article as { sectionSummaries?: Record<string, unknown> }).sectionSummaries
  const globalContext =
    sm && typeof sm === 'object' && typeof sm.globalContext === 'string' ? sm.globalContext.slice(0, 12000) : ''

  for (const row of specs) {
    if (secDone.has(row.id)) continue
    if (await pendingOrRunningDraftSectionFor(payload, articleIdNum, row.id)) continue

    await payload.create({
      collection: 'workflow-jobs',
      data: {
        label: `[catchup] section "${row.id}" → article #${articleIdNum}`,
        jobType: 'draft_section',
        status: 'pending',
        article: articleIdNum,
        contentBrief: briefNum,
        ...(siteNum != null ? { site: siteNum } : {}),
        ...(tenantNum != null ? { tenant: tenantNum } : {}),
        input: {
          briefId: briefNum,
          articleId: articleIdNum,
          sectionId: row.id,
          sectionType: row.sectionType,
          globalContext,
          quickWinCatchup: true,
        },
      },
      overrideAccess: true,
    })
    createdSections += 1
  }
  if (createdSections > 0) messages.push(`入队 draft_section × ${createdSections}`)

  const doneAfter = await successfulDraftSectionIds(payload, articleIdNum)
  const allSectionsDone = specs.every((e) => doneAfter.has(e.id))

  if (
    allSectionsDone &&
    !(await hasSuccessfulFinalize(payload, articleIdNum)) &&
    !(await hasPendingOrRunningFinalize(payload, articleIdNum))
  ) {
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
        input: { articleId: articleIdNum, briefId: briefNum, quickWinCatchup: true },
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
