import type { Payload } from 'payload'

import { forwardPipelinePost, readJsonSafe } from '@/app/api/pipeline/lib/internalPipelineFetch'
import { checkPipelineSpendForJob } from '@/utilities/siteQuotaCheck'

export type WorkflowJobDoc = {
  id: string | number
  jobType?: string | null
  input?: unknown
  article?: unknown
  site?: unknown
  pipelineKeyword?: unknown
  contentBrief?: unknown
  page?: unknown
}

function relId(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object' && 'id' in value) return String((value as { id: unknown }).id)
  return null
}

export function articleIdFromJob(job: WorkflowJobDoc): string | null {
  const fromRel = relId(job.article)
  if (fromRel) return fromRel
  const input = job.input && typeof job.input === 'object' ? (job.input as Record<string, unknown>) : null
  const aid = input?.articleId
  if (typeof aid === 'string' || typeof aid === 'number') return String(aid)
  return null
}

export function siteIdFromJob(job: WorkflowJobDoc): string | null {
  return relId(job.site)
}

export function keywordIdFromJob(job: WorkflowJobDoc): string | null {
  const fromRel = relId(job.pipelineKeyword)
  if (fromRel) return fromRel
  const input = job.input && typeof job.input === 'object' ? (job.input as Record<string, unknown>) : null
  const kid = input?.keywordId
  if (typeof kid === 'string' || typeof kid === 'number') return String(kid)
  return null
}

export function briefIdFromJob(job: WorkflowJobDoc): string | null {
  const fromRel = relId(job.contentBrief)
  if (fromRel) return fromRel
  const input = job.input && typeof job.input === 'object' ? (job.input as Record<string, unknown>) : null
  const bid = input?.briefId
  if (typeof bid === 'string' || typeof bid === 'number') return String(bid)
  return null
}

function jobInput(job: WorkflowJobDoc): Record<string, unknown> {
  return job.input && typeof job.input === 'object' ? (job.input as Record<string, unknown>) : {}
}

export async function keywordTermFromJob(payload: Payload, job: WorkflowJobDoc): Promise<string | null> {
  const input = jobInput(job)
  if (typeof input.keyword === 'string' && input.keyword.trim()) return input.keyword.trim()

  const pk = job.pipelineKeyword
  if (pk && typeof pk === 'object' && 'term' in pk) {
    const t = (pk as { term?: unknown }).term
    if (typeof t === 'string' && t.trim()) return t.trim()
  }

  const id = keywordIdFromJob(job)
  if (!id) return null
  try {
    const kw = await payload.findByID({ collection: 'keywords', id: String(id), depth: 0 })
    const term = (kw as { term?: string } | null)?.term
    return term?.trim() || null
  } catch {
    return null
  }
}

function numericIfDigits(value: string | null): string | number | undefined {
  if (value == null) return undefined
  return /^\d+$/.test(value) ? Number(value) : value
}

/**
 * Runs one job by forwarding to an existing `/api/pipeline/*` route (same auth as parent request).
 * Unknown `jobType` returns 200 + `{ skipped: true }` so the queue does not stall.
 */
export async function dispatchWorkflowJob(
  request: Request,
  job: WorkflowJobDoc,
  payload: Payload,
): Promise<Response> {
  const jt = job.jobType ?? 'custom'
  const articleId = articleIdFromJob(job)
  const siteId = siteIdFromJob(job)
  const input = jobInput(job)

  const siteNum = siteId != null && /^\d+$/.test(String(siteId)) ? Number(siteId) : NaN
  if (Number.isFinite(siteNum)) {
    const gate = await checkPipelineSpendForJob(payload, siteNum, jt)
    if (!gate.ok) {
      return Response.json({ ok: false, error: 'quota_exceeded', message: gate.message })
    }
  }

  switch (jt) {
    case 'internal_link_inject': {
      if (!articleId) {
        return Response.json({ error: 'articleId required (set article relation or input.articleId)' }, { status: 400 })
      }
      return forwardPipelinePost(request, '/api/pipeline/internal-link-inject', { articleId })
    }
    case 'internal_link_reinforce': {
      if (!articleId) {
        return Response.json({ error: 'articleId required' }, { status: 400 })
      }
      return forwardPipelinePost(request, '/api/pipeline/internal-link-reinforce', { articleId })
    }
    case 'internal_link_rewrite': {
      if (!articleId) {
        return Response.json({ error: 'articleId required' }, { status: 400 })
      }
      return forwardPipelinePost(request, '/api/pipeline/internal-link-rewrite', {
        articleId,
        mergeTargetArticleId: input.mergeTargetArticleId ?? null,
        reason: typeof input.reason === 'string' ? input.reason : undefined,
      })
    }
    case 'triage':
      return forwardPipelinePost(request, '/api/pipeline/triage', {})
    case 'alert_eval':
      return forwardPipelinePost(request, '/api/pipeline/alert-eval', {
        ...(typeof input.metricsJson === 'string' ? { metricsJson: input.metricsJson } : {}),
      })
    case 'anchor_audit':
      return forwardPipelinePost(request, '/api/pipeline/anchor-audit', {
        siteId: siteId ?? '0',
      })
    case 'internal_link_audit':
      return forwardPipelinePost(request, '/api/pipeline/internal-link-audit', {
        ...(siteId ? { siteId } : {}),
      })
    case 'topic_cluster_audit':
      return forwardPipelinePost(request, '/api/pipeline/topic-cluster-audit', {
        ...(siteId ? { siteId } : {}),
      })
    case 'keyword_discover': {
      if (!siteId) {
        return Response.json({ error: 'siteId required (set site on job)' }, { status: 400 })
      }
      return forwardPipelinePost(request, '/api/pipeline/keyword-discover', {
        siteId,
        seed: typeof input.seed === 'string' ? input.seed : undefined,
      })
    }
    case 'rank_track': {
      const term = (typeof input.keyword === 'string' && input.keyword.trim()) || (await keywordTermFromJob(payload, job))
      if (!term) {
        return Response.json(
          { error: 'keyword text required (input.keyword or pipelineKeyword / keywordId)' },
          { status: 400 },
        )
      }
      const kid = keywordIdFromJob(job)
      const siteNum = numericIfDigits(siteId)
      return forwardPipelinePost(request, '/api/pipeline/rank-track', {
        keyword: term,
        ...(kid ? { keywordId: numericIfDigits(kid) ?? kid } : {}),
        ...(typeof siteNum === 'number' ? { siteId: siteNum } : {}),
      })
    }
    case 'serp_audit': {
      const q =
        (typeof input.q === 'string' && input.q.trim()) ||
        (typeof input.keyword === 'string' && input.keyword.trim()) ||
        (await keywordTermFromJob(payload, job))
      if (!q) {
        return Response.json({ error: 'q or resolvable keyword required' }, { status: 400 })
      }
      return forwardPipelinePost(request, '/api/pipeline/serp-audit', { q })
    }
    case 'keyword_cluster': {
      const fromRelSite = numericIfDigits(siteId)
      const sid =
        typeof fromRelSite === 'number'
          ? fromRelSite
          : typeof input.siteId === 'number' && Number.isFinite(input.siteId)
            ? input.siteId
            : typeof input.siteId === 'string' && /^\d+$/.test(input.siteId.trim())
              ? Number(input.siteId.trim())
              : null
      if (sid == null || !Number.isFinite(sid)) {
        return Response.json(
          { error: 'siteId required (job.site relation or numeric input.siteId)' },
          { status: 400 },
        )
      }
      const rawK = input.keywordIds
      const keywordIds: number[] = []
      if (Array.isArray(rawK)) {
        for (const x of rawK) {
          const n = typeof x === 'number' ? x : Number(x)
          if (Number.isFinite(n)) keywordIds.push(Math.floor(n))
        }
      }
      if (keywordIds.length === 0) {
        return Response.json({ error: 'input.keywordIds required (non-empty number[])' }, { status: 400 })
      }
      const quota = await checkPipelineSpendForJob(payload, sid, 'keyword_cluster')
      if (!quota.ok) {
        return Response.json({ ok: false, error: 'quota_exceeded', message: quota.message })
      }
      const mo =
        typeof input.minOverlap === 'number'
          ? input.minOverlap
          : typeof input.minOverlap === 'string'
            ? Number(input.minOverlap)
            : Number.NaN
      const minOverlap = Number.isFinite(mo)
        ? Math.min(6, Math.max(2, Math.floor(mo)))
        : 3
      return forwardPipelinePost(request, '/api/pipeline/keyword-cluster', {
        siteId: sid,
        keywordIds,
        minOverlap,
        ...(input.refresh === true ? { refresh: true } : {}),
      })
    }
    case 'brief_generate': {
      const kid = keywordIdFromJob(job)
      if (!kid) {
        return Response.json({ error: 'keywordId required (pipelineKeyword or input.keywordId)' }, { status: 400 })
      }
      const siteNum = numericIfDigits(siteId)
      return forwardPipelinePost(request, '/api/pipeline/brief-generate', {
        keywordId: numericIfDigits(kid) ?? kid,
        ...(typeof siteNum === 'number' ? { siteId: siteNum } : {}),
      })
    }
    case 'draft_skeleton': {
      const bid = briefIdFromJob(job)
      if (!bid) {
        return Response.json({ error: 'briefId required (contentBrief or input.briefId)' }, { status: 400 })
      }
      const siteNum = numericIfDigits(siteId)
      return forwardPipelinePost(request, '/api/pipeline/draft-skeleton', {
        briefId: numericIfDigits(bid) ?? bid,
        ...(typeof siteNum === 'number' ? { siteId: siteNum } : {}),
      })
    }
    case 'draft_section': {
      if (!input.sectionId) {
        return Response.json({ error: 'input.sectionId required' }, { status: 400 })
      }
      const aidRaw = articleIdFromJob(job)
      const bidRaw = briefIdFromJob(job)
      return forwardPipelinePost(request, '/api/pipeline/draft-section', {
        model: typeof input.model === 'string' ? input.model : undefined,
        sectionId: String(input.sectionId),
        sectionType: typeof input.sectionType === 'string' ? input.sectionType : undefined,
        previousSectionSummary:
          typeof input.previousSectionSummary === 'string' ? input.previousSectionSummary : undefined,
        globalContext: typeof input.globalContext === 'string' ? input.globalContext : undefined,
        ...(aidRaw && /^\d+$/.test(aidRaw)
          ? { articleId: numericIfDigits(aidRaw) ?? aidRaw }
          : typeof input.articleId === 'string' || typeof input.articleId === 'number'
            ? { articleId: Number.isFinite(Number(input.articleId)) ? Number(input.articleId) : input.articleId }
            : {}),
        ...(bidRaw && /^\d+$/.test(bidRaw)
          ? { briefId: numericIfDigits(bidRaw) ?? bidRaw }
          : typeof input.briefId === 'string' || typeof input.briefId === 'number'
            ? { briefId: Number.isFinite(Number(input.briefId)) ? Number(input.briefId) : input.briefId }
            : {}),
      })
    }
    case 'draft_finalize': {
      const aidFin = articleIdFromJob(job)
      const bodyTxt = typeof input.bodyText === 'string' ? input.bodyText : ''
      const idFromRel = aidFin != null && /^\d+$/.test(aidFin) ? Number(aidFin) : null
      const idFromInput =
        typeof input.articleId === 'number' && Number.isFinite(input.articleId)
          ? input.articleId
          : typeof input.articleId === 'string' && /^\d+$/.test(input.articleId)
            ? Number(input.articleId)
            : null
      const targetArticleId = idFromRel ?? idFromInput
      if (targetArticleId != null && Number.isFinite(targetArticleId)) {
        return forwardPipelinePost(request, '/api/pipeline/draft-finalize', {
          articleId: targetArticleId,
        })
      }
      if (!bodyTxt.trim()) {
        return Response.json(
          { error: 'input.bodyText or resolvable articleId required' },
          { status: 400 },
        )
      }
      return forwardPipelinePost(request, '/api/pipeline/draft-finalize', { bodyText: bodyTxt })
    }
    case 'image_generate': {
      if (typeof input.prompt !== 'string' || !input.prompt.trim()) {
        return Response.json({ error: 'input.prompt required' }, { status: 400 })
      }
      const siteNum = numericIfDigits(siteId)
      const aidImg = articleIdFromJob(job)
      const articleFromInput =
        typeof input.articleId === 'number'
          ? input.articleId
          : typeof input.articleId === 'string' && /^\d+$/.test(input.articleId)
            ? Number(input.articleId)
            : undefined
      const articleNumeric =
        aidImg && /^\d+$/.test(aidImg) ? Number(aidImg) : articleFromInput
      return forwardPipelinePost(request, '/api/pipeline/image-generate', {
        prompt: input.prompt,
        ...(typeof siteNum === 'number' ? { siteId: siteNum } : {}),
        ...(typeof input.siteId === 'number' && Number.isFinite(input.siteId) ? { siteId: input.siteId } : {}),
        ...(typeof articleNumeric === 'number' && Number.isFinite(articleNumeric)
          ? { articleId: articleNumeric }
          : {}),
        ...(input.asFeatured === true ? { asFeatured: true } : {}),
      })
    }
    case 'media_image_generate': {
      const mid =
        typeof input.mediaId === 'number' && Number.isFinite(input.mediaId)
          ? input.mediaId
          : typeof input.mediaId === 'string' && /^\d+$/.test(input.mediaId.trim())
            ? Number(input.mediaId.trim())
            : null
      const aid =
        typeof input.articleId === 'number' && Number.isFinite(input.articleId)
          ? input.articleId
          : typeof input.articleId === 'string' && /^\d+$/.test(String(input.articleId).trim())
            ? Number(String(input.articleId).trim())
            : null
      const pid =
        typeof input.pageId === 'number' && Number.isFinite(input.pageId)
          ? input.pageId
          : typeof input.pageId === 'string' && /^\d+$/.test(String(input.pageId).trim())
            ? Number(String(input.pageId).trim())
            : null
      const modes = [mid != null, aid != null, pid != null].filter(Boolean).length
      if (modes !== 1) {
        return Response.json(
          { error: 'input must set exactly one of mediaId, articleId, pageId' },
          { status: 400 },
        )
      }
      const siteNum = numericIfDigits(siteId)
      const siteFromInput =
        typeof input.siteId === 'number' && Number.isFinite(input.siteId) ? input.siteId : undefined
      const siteMerged =
        typeof siteNum === 'number' ? siteNum : siteFromInput != null ? siteFromInput : undefined
      if (mid != null) {
        return forwardPipelinePost(request, '/api/pipeline/media-image-generate', {
          mediaId: mid,
          ...(typeof siteMerged === 'number' ? { siteId: siteMerged } : {}),
        })
      }
      if (aid != null) {
        return forwardPipelinePost(request, '/api/pipeline/media-image-generate', {
          articleId: aid,
          ...(typeof siteMerged === 'number' ? { siteId: siteMerged } : {}),
        })
      }
      return forwardPipelinePost(request, '/api/pipeline/media-image-generate', {
        pageId: pid,
        ...(typeof siteMerged === 'number' ? { siteId: siteMerged } : {}),
      })
    }
    case 'category_cover_generate': {
      const cid =
        typeof input.categoryId === 'number' && Number.isFinite(input.categoryId)
          ? Math.floor(input.categoryId)
          : typeof input.categoryId === 'string' && /^\d+$/.test(input.categoryId.trim())
            ? Number(input.categoryId.trim())
            : null
      if (cid == null) {
        return Response.json({ error: 'input.categoryId required' }, { status: 400 })
      }
      const siteNum = numericIfDigits(siteId)
      const siteFromInput =
        typeof input.siteId === 'number' && Number.isFinite(input.siteId) ? input.siteId : undefined
      const siteMerged =
        typeof siteNum === 'number' ? siteNum : siteFromInput != null ? siteFromInput : undefined
      return forwardPipelinePost(request, '/api/pipeline/category-cover-generate', {
        categoryId: cid,
        ...(typeof siteMerged === 'number' ? { siteId: siteMerged } : {}),
        ...(typeof input.prompt === 'string' && input.prompt.trim() ? { prompt: input.prompt.trim() } : {}),
      })
    }
    case 'hero_banner_generate': {
      const sid =
        typeof input.siteId === 'number' && Number.isFinite(input.siteId)
          ? Math.floor(input.siteId)
          : typeof input.siteId === 'string' && /^\d+$/.test(input.siteId.trim())
            ? Number(input.siteId.trim())
            : null
      const fromJobSite = numericIfDigits(siteId)
      const siteMerged =
        sid != null && Number.isFinite(sid) ? sid : typeof fromJobSite === 'number' ? fromJobSite : null
      if (siteMerged == null || !Number.isFinite(siteMerged)) {
        return Response.json(
          { error: 'siteId required (job.site relation or numeric input.siteId)' },
          { status: 400 },
        )
      }
      return forwardPipelinePost(request, '/api/pipeline/site-hero-banner-generate', {
        siteId: siteMerged,
        ...(typeof input.prompt === 'string' && input.prompt.trim()
          ? { prompt: input.prompt.trim() }
          : {}),
      })
    }
    case 'site_logo_generate': {
      const sid =
        typeof input.siteId === 'number' && Number.isFinite(input.siteId)
          ? Math.floor(input.siteId)
          : typeof input.siteId === 'string' && /^\d+$/.test(input.siteId.trim())
            ? Number(input.siteId.trim())
            : null
      const fromJobSite = numericIfDigits(siteId)
      const siteMerged =
        sid != null && Number.isFinite(sid) ? sid : typeof fromJobSite === 'number' ? fromJobSite : null
      if (siteMerged == null || !Number.isFinite(siteMerged)) {
        return Response.json(
          { error: 'siteId required (job.site relation or numeric input.siteId)' },
          { status: 400 },
        )
      }
      return forwardPipelinePost(request, '/api/pipeline/site-logo-generate', {
        siteId: siteMerged,
        ...(typeof input.prompt === 'string' && input.prompt.trim()
          ? { prompt: input.prompt.trim() }
          : {}),
      })
    }
    case 'amazon_sync': {
      if (typeof input.asin !== 'string' || !input.asin.trim()) {
        return Response.json({ error: 'input.asin required' }, { status: 400 })
      }
      return forwardPipelinePost(request, '/api/pipeline/amazon-sync', { asin: input.asin.trim() })
    }
    case 'competitor_gap':
      return forwardPipelinePost(request, '/api/pipeline/competitor-gap', {
        topic: typeof input.topic === 'string' ? input.topic : undefined,
        urls: Array.isArray(input.urls) ? (input.urls as unknown[]).filter((u): u is string => typeof u === 'string') : undefined,
      })
    case 'backlink_scan': {
      if (typeof input.target !== 'string' || !input.target.trim()) {
        return Response.json({ error: 'input.target (domain) required' }, { status: 400 })
      }
      return forwardPipelinePost(request, '/api/pipeline/backlink-scan', { target: input.target.trim() })
    }
    case 'domain_audit':
      return forwardPipelinePost(request, '/api/pipeline/domain-audit', {
        pageUrl: typeof input.pageUrl === 'string' ? input.pageUrl : undefined,
        htmlExcerpt: typeof input.htmlExcerpt === 'string' ? input.htmlExcerpt : undefined,
      })
    case 'content_audit': {
      if (!articleId) {
        return Response.json({ error: 'articleId required' }, { status: 400 })
      }
      return forwardPipelinePost(request, '/api/pipeline/content-audit', { articleId })
    }
    case 'content_refresh': {
      if (!articleId) {
        return Response.json({ error: 'articleId required' }, { status: 400 })
      }
      return forwardPipelinePost(request, '/api/pipeline/content-refresh', { articleId })
    }
    case 'content_merge': {
      if (!articleId) {
        return Response.json({ error: 'articleId required' }, { status: 400 })
      }
      return forwardPipelinePost(request, '/api/pipeline/content-merge', {
        articleId,
        mergeTargetArticleId:
          typeof input.mergeTargetArticleId === 'string' ? input.mergeTargetArticleId : undefined,
      })
    }
    case 'content_archive': {
      if (!articleId) {
        return Response.json({ error: 'articleId required' }, { status: 400 })
      }
      return forwardPipelinePost(request, '/api/pipeline/content-archive', { articleId })
    }
    case 'meta_ab_optimize': {
      if (!articleId) {
        return Response.json({ error: 'articleId required' }, { status: 400 })
      }
      return forwardPipelinePost(request, '/api/pipeline/meta-ab-optimize', {
        articleId,
        title: typeof input.titleHint === 'string' ? input.titleHint : undefined,
      })
    }
    default:
      return Response.json({
        ok: true,
        skipped: true,
        jobType: jt,
        message: 'No HTTP executor wired; mark completed to unblock queue.',
      })
  }
}

export type JobRunOutcome = {
  httpStatus: number
  body: unknown
  /** false if HTTP error or JSON body has ok: false */
  success: boolean
}

export async function interpretJobResponse(res: Response): Promise<JobRunOutcome> {
  const body = await readJsonSafe(res)
  const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  const okField = obj?.ok
  const success = res.ok && okField !== false
  return { httpStatus: res.status, body, success }
}
