import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { loadBriefSectionSpecs } from '@/app/api/pipeline/lib/articlePipelineChain'
import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { runSectionPrompt } from '@/services/writing/sectionExecutor'
import { tavilySearch } from '@/services/integrations/tavily/client'
import { writeSectionIntoArticleBody } from '@/services/writing/writeSectionIntoArticleBody'
import { resolveOptionalPipelineTenant } from '@/utilities/openRouterTenantPrompts/resolveOptionalPipelineTenant'
import {
  pickEeatWeightsForContentType,
  pickFallbackModelFromSectionRetry,
  pickPipelineOpenRouterModel,
  type PipelineSettingShape,
  wordBudgetHintFromArticleStrategy,
} from '@/utilities/pipelineSettingShape'
import { resolvePipelineConfig, resolvePipelineConfigForArticle } from '@/utilities/resolvePipelineConfig'
import { incrementSiteQuotaUsage } from '@/utilities/siteQuotaCheck'

export const dynamic = 'force-dynamic'

const PATH = '/api/pipeline/draft-section'

async function excerptFromSequentialPrevious(
  payload: Awaited<ReturnType<typeof getPayload>>,
  articleId: number,
  briefId: number,
  sectionId: string,
): Promise<string | undefined> {
  const specs = await loadBriefSectionSpecs(payload, briefId)
  const ix = specs.findIndex((s) => s.id === sectionId)
  if (ix <= 0) return undefined
  const prevId = specs[ix - 1]?.id
  if (!prevId) return undefined
  const doc = await payload.findByID({
    collection: 'articles',
    id: String(articleId),
    depth: 0,
    overrideAccess: true,
  })
  const sm = (doc as { sectionSummaries?: Record<string, { excerpt?: string }> }).sectionSummaries
  const ex = sm?.[prevId]?.excerpt
  return typeof ex === 'string' && ex.trim() ? ex.trim() : undefined
}

export async function POST(request: Request): Promise<Response> {
  const started = Date.now()
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as {
    model?: string
    sectionId?: string
    sectionType?: string
    previousSectionSummary?: string
    globalContext?: string
    articleId?: string | number
    briefId?: string | number
    tenantId?: string | number
    siteId?: string | number
    pipelineProfileId?: string | number
  }
  if (!body.sectionId) {
    return Response.json({ error: 'sectionId required' }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })

  let tenantId: number | null = null
  const rawTenant = body.tenantId
  if (rawTenant != null) {
    const n = typeof rawTenant === 'number' ? rawTenant : Number(rawTenant)
    if (Number.isFinite(n)) tenantId = n
  }
  if (tenantId == null && body.siteId != null) {
    const s = typeof body.siteId === 'number' ? body.siteId : Number(body.siteId)
    if (Number.isFinite(s)) {
      tenantId = await resolveOptionalPipelineTenant(payload, { siteId: s })
    }
  }
  if (tenantId == null && body.articleId != null) {
    const aid = typeof body.articleId === 'number' ? body.articleId : Number(body.articleId)
    if (Number.isFinite(aid)) {
      try {
        const doc = await payload.findByID({
          collection: 'articles',
          id: String(aid),
          depth: 0,
          overrideAccess: true,
        })
        const tFromArticle = (doc as { tenant?: number | { id: number } | null })?.tenant
        const tn =
          typeof tFromArticle === 'number'
            ? tFromArticle
            : typeof tFromArticle === 'object' && tFromArticle?.id != null
              ? tFromArticle.id
              : null
        if (typeof tn === 'number' && Number.isFinite(tn)) {
          tenantId = tn
        }
        const siteRaw = (doc as { site?: number | { id: number } | null })?.site
        const siteRel =
          typeof siteRaw === 'object' && siteRaw?.id != null
            ? siteRaw.id
            : typeof siteRaw === 'number'
              ? siteRaw
              : null
        if (tenantId == null && typeof siteRel === 'number' && Number.isFinite(siteRel)) {
          tenantId = await resolveOptionalPipelineTenant(payload, { siteId: siteRel })
        }
      } catch {
        /* ignore */
      }
    }
  }

  const rawPp = body.pipelineProfileId
  let explicitPipelineProfileId: number | null = null
  if (typeof rawPp === 'number' && Number.isFinite(rawPp)) {
    explicitPipelineProfileId = Math.floor(rawPp)
  } else if (typeof rawPp === 'string' && /^\d+$/.test(rawPp.trim())) {
    explicitPipelineProfileId = Number(rawPp.trim())
  }

  let siteNum: number | null = null
  if (body.siteId != null) {
    const s = typeof body.siteId === 'number' ? body.siteId : Number(body.siteId)
    if (Number.isFinite(s)) siteNum = s
  }
  if (siteNum == null && body.articleId != null) {
    const aid = typeof body.articleId === 'number' ? body.articleId : Number(body.articleId)
    if (Number.isFinite(aid)) {
      try {
        const doc = await payload.findByID({
          collection: 'articles',
          id: String(aid),
          depth: 0,
          overrideAccess: true,
        })
        const siteRaw = (doc as { site?: number | { id: number } | null })?.site
        const siteRel =
          typeof siteRaw === 'object' && siteRaw?.id != null
            ? siteRaw.id
            : typeof siteRaw === 'number'
              ? siteRaw
              : null
        if (typeof siteRel === 'number' && Number.isFinite(siteRel)) siteNum = siteRel
      } catch {
        /* ignore */
      }
    }
  }

  const sectionType = body.sectionType || 'custom'

  let merged: PipelineSettingShape | null = null
  if (body.articleId != null) {
    const aid = typeof body.articleId === 'number' ? body.articleId : Number(body.articleId)
    if (Number.isFinite(aid)) {
      const cfg = await resolvePipelineConfigForArticle(payload, aid, explicitPipelineProfileId)
      if (!('ok' in cfg && cfg.ok === false)) merged = cfg.merged
    }
  }
  if (merged == null && tenantId != null) {
    const cfg = await resolvePipelineConfig({
      payload,
      tenantId,
      siteId: siteNum,
      explicitProfileId: explicitPipelineProfileId,
    })
    merged = cfg.merged
  }

  let model =
    typeof body.model === 'string' && body.model.trim().length > 0 ? body.model.trim() : ''
  if (!model && merged) {
    model = pickPipelineOpenRouterModel(merged, sectionType)
  }
  if (!model) {
    model = 'openai/gpt-4o-mini'
  }
  const fbModel = merged ? pickFallbackModelFromSectionRetry(merged, sectionType) : null

  const maxRetry = Math.max(1, Math.floor(merged?.sectionMaxRetry ?? 3))
  const eeatWeights = merged ?
    pickEeatWeightsForContentType(merged.eeatWeights, sectionType)
  : undefined

  let previousSectionSummary = body.previousSectionSummary
  const aidResolved =
    body.articleId != null
      ? typeof body.articleId === 'number'
        ? body.articleId
        : Number(body.articleId)
      : NaN
  const bidResolved =
    body.briefId != null
      ? typeof body.briefId === 'number'
        ? body.briefId
        : Number(body.briefId)
      : NaN

  if (merged?.sectionVariant === 'parallel_with_summary') {
    previousSectionSummary = undefined
  } else if (
    merged?.sectionVariant === 'sequential_context' &&
    Number.isFinite(aidResolved) &&
    Number.isFinite(bidResolved)
  ) {
    const ex = await excerptFromSequentialPrevious(payload, aidResolved, bidResolved, body.sectionId)
    if (ex) previousSectionSummary = ex
  }

  let globalContext =
    typeof body.globalContext === 'string' ? body.globalContext.trim() : ''
  const wb =
    merged ? wordBudgetHintFromArticleStrategy(merged.articleStrategy, sectionType) : undefined
  if (wb?.trim()) {
    globalContext = globalContext ? `${globalContext}\n\n${wb}` : wb
  }

  let researchSlice: string | undefined
  if (merged?.sectionVariant === 'research_per_section' && merged.tavilyEnabled) {
    const qTail = `${globalContext}`.slice(0, 400)
    try {
      const raw = await tavilySearch({
        query:
          `${qTail}\nsection "${body.sectionId}"`.slice(0, 440),
        search_depth: merged.frugalMode ? 'basic' : 'advanced',
        max_results: merged.frugalMode ? 6 : 10,
        include_raw_content: false,
      })
      researchSlice = JSON.stringify(raw ?? {}).slice(0, 8000)
      if (typeof siteNum === 'number' && Number.isFinite(siteNum)) {
        try {
          await incrementSiteQuotaUsage(payload, siteNum, {
            tavilyUsd: merged.frugalMode ? 0.0005 : 0.002,
          })
        } catch {
          /* optional */
        }
      }
    } catch {
      researchSlice = undefined
    }
  }

  let text = ''
  let lastError: Error | null = null
  let usageOut: Record<string, number | undefined> | undefined
  let modelUsed = model

  for (let attempt = 0; attempt < maxRetry; attempt += 1) {
    try {
      const trialModel =
        attempt > 0 && fbModel ? fbModel : model
      modelUsed = trialModel
      const { text: tOut, usage } = await runSectionPrompt(payload, tenantId, {
        model: trialModel,
        sectionId: body.sectionId,
        sectionType,
        previousSectionSummary,
        globalContext,
        ...(eeatWeights ? { eeatWeights } : {}),
        ...(researchSlice ? { researchSlice } : {}),
      })
      text = tOut
      usageOut =
        usage ?
          {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
          }
        : undefined
      lastError = null
      break
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      if (attempt === maxRetry - 1) {
        return Response.json(
          {
            ok: false,
            error: lastError.message,
            sectionId: body.sectionId,
            attempts: maxRetry,
            elapsedMs: Date.now() - started,
          },
          { status: 502 },
        )
      }
    }
  }
  if (lastError != null || !text) {
    return Response.json(
      {
        ok: false,
        error: lastError?.message ?? 'empty_response',
        sectionId: body.sectionId,
        elapsedMs: Date.now() - started,
      },
      { status: 502 },
    )
  }

  let written = false

  if (body.articleId != null) {
    const aid = typeof body.articleId === 'number' ? body.articleId : Number(body.articleId)
    if (!Number.isFinite(aid)) {
      return Response.json({ error: 'articleId invalid' }, { status: 400 })
    }
    const w = await writeSectionIntoArticleBody(payload, {
      articleId: aid,
      sectionId: body.sectionId,
      sectionMarkdown: text,
    })
    if (!w.ok) {
      return Response.json(
        {
          ok: false,
          error: w.reason,
          text,
          sectionId: body.sectionId,
          articleId: aid,
          elapsedMs: Date.now() - started,
          ...(usageOut ? { usage: usageOut } : {}),
          model: modelUsed,
        },
        { status: 422 },
      )
    }
    written = true
    try {
      const doc = await payload.findByID({
        collection: 'articles',
        id: String(aid),
        depth: 0,
        overrideAccess: true,
      })
      const siteRaw = (doc as { site?: number | { id: number } | null })?.site
      const siteRel =
        typeof siteRaw === 'object' && siteRaw?.id != null
          ? siteRaw.id
          : typeof siteRaw === 'number'
            ? siteRaw
            : null
      if (typeof siteRel === 'number' && Number.isFinite(siteRel)) {
        await incrementSiteQuotaUsage(payload, siteRel, { openrouterUsd: 0.02 })
      }
    } catch {
      /* optional quota */
    }
  }

  return Response.json({
    ok: true,
    text,
    sectionId: body.sectionId,
    articleId:
      body.articleId != null ?
        typeof body.articleId === 'number'
          ? body.articleId
          : Number(body.articleId)
      : null,
    written,
    briefId:
      typeof body.briefId === 'number'
        ? body.briefId
        : typeof body.briefId === 'string'
          ? Number(body.briefId)
          : null,
    elapsedMs: Date.now() - started,
    ...(usageOut ? { usage: usageOut } : {}),
    model: modelUsed,
    handoff: {
      recommendedNextSkill: body.articleId != null ? 'pipeline-draft-finalize' : '',
    },
  })
}
