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
      return forwardPipelinePost(request, '/api/pipeline/draft-section', {
        model: typeof input.model === 'string' ? input.model : undefined,
        sectionId: String(input.sectionId),
        sectionType: typeof input.sectionType === 'string' ? input.sectionType : undefined,
        previousSectionSummary:
          typeof input.previousSectionSummary === 'string' ? input.previousSectionSummary : undefined,
        globalContext: typeof input.globalContext === 'string' ? input.globalContext : undefined,
      })
    }
    case 'draft_finalize': {
      if (typeof input.bodyText !== 'string' || !input.bodyText.trim()) {
        return Response.json({ error: 'input.bodyText required' }, { status: 400 })
      }
      return forwardPipelinePost(request, '/api/pipeline/draft-finalize', { bodyText: input.bodyText })
    }
    case 'image_generate': {
      if (typeof input.prompt !== 'string' || !input.prompt.trim()) {
        return Response.json({ error: 'input.prompt required' }, { status: 400 })
      }
      const siteNum = numericIfDigits(siteId)
      return forwardPipelinePost(request, '/api/pipeline/image-generate', {
        prompt: input.prompt,
        ...(typeof siteNum === 'number' ? { siteId: siteNum } : {}),
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
