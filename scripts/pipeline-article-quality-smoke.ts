/**
 * End-to-end smoke: brief → skeleton → all draft sections → finalize, then heuristic score on Lexical body.
 *
 * Requires `.env` with DB + `OPENROUTER_API_KEY`, DataForSEO/Tavily keys as your pipeline preset expects.
 * Seed data: `pnpm seed:dev` (default keyword slug `seed-keyword-1`).
 *
 * Usage:
 *   pnpm pipeline:smoke-article
 * Optional env:
 *   PIPELINE_SMOKE_KEYWORD_SLUG=seed-keyword-1
 *   PIPELINE_SMOKE_PROFILE_SLUG=quality-constrained
 *   PIPELINE_SMOKE_PROFILE_ID=123   (overrides slug lookup)
 *   PIPELINE_SMOKE_MIN_SCORE=80
 */
import 'dotenv/config'

import type { Payload } from 'payload'
import { getPayload } from 'payload'

import { loadBriefSectionSpecs } from '../src/app/api/pipeline/lib/articlePipelineChain'
import { runBriefGeneration } from '../src/app/api/pipeline/brief-generate/runBriefGeneration'
import { runDraftFinalizeForArticle } from '../src/app/api/pipeline/draft-finalize/runDraftFinalize'
import { runDraftSkeletonFromBrief } from '../src/app/api/pipeline/draft-skeleton/runDraftSkeleton'
import config from '../src/payload.config.js'
import {
  buildOriginalEvidenceContextAppendix,
  loadOriginalEvidencePromptSlice,
} from '../src/services/evidence/formatOriginalEvidenceForPrompt'
import { tavilySearch } from '../src/services/integrations/tavily/client'
import { runSectionPrompt } from '../src/services/writing/sectionExecutor'
import { writeSectionIntoArticleBody } from '../src/services/writing/writeSectionIntoArticleBody'
import { PIPELINE_DEFAULT_OPENROUTER_LLM } from '../src/constants/pipelineOpenRouterModels'
import {
  pickEeatWeightsForContentType,
  pickFallbackModelFromSectionRetry,
  pickPipelineOpenRouterModel,
  wordBudgetHintFromArticleStrategy,
} from '../src/utilities/pipelineSettingShape'
import { normalizeBriefVariant } from '../src/utilities/pipelineVariants'
import {
  resolvePipelineConfig,
  resolvePipelineConfigForArticle,
  type ResolvedPipelineConfig,
} from '../src/utilities/resolvePipelineConfig'
import { scoreArticleBodyPublishHeuristic } from '../src/utilities/articleMarkdownPublishHeuristic'
import { d1NarrowUpdate } from '../src/utilities/d1NarrowUpdate'
import {
  auditOnPageSeoFormat,
  onPageSeoFormatRequirements,
} from '../src/utilities/onPageSeoFormatAudit'
import { formatSeoWorkflowPromptBlock } from '../src/utilities/seoWorkflowPromptBlock'
import { extractTavilyUsageCredits, tavilyCreditsToUsd } from '../src/utilities/tavilyUsageCredits'
import { incrementSiteQuotaUsage } from '../src/utilities/siteQuotaCheck'

const KEYWORD_SLUG = process.env.PIPELINE_SMOKE_KEYWORD_SLUG?.trim() || 'seed-keyword-1'
const PROFILE_SLUG = process.env.PIPELINE_SMOKE_PROFILE_SLUG?.trim() || 'quality-constrained'
const MIN_SCORE = Math.max(0, Math.min(100, Number(process.env.PIPELINE_SMOKE_MIN_SCORE ?? '80') || 80))
const EXPLICIT_PROFILE_ID_RAW = process.env.PIPELINE_SMOKE_PROFILE_ID?.trim()

async function excerptFromSequentialPrevious(
  payload: Payload,
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

async function delegateOutlineForBrief(payload: Payload, briefId: number): Promise<string> {
  const brief = await payload.findByID({
    collection: 'content-briefs',
    id: String(briefId),
    depth: 0,
    overrideAccess: true,
  })
  const gc = (brief as { outline?: { globalContext?: { delegateOutline?: string } } })?.outline?.globalContext
  return typeof gc?.delegateOutline === 'string' ? gc.delegateOutline.trim().slice(0, 12000) : ''
}

function isResolvedPipelineConfig(
  x: ResolvedPipelineConfig | { ok: false; error: string },
): x is ResolvedPipelineConfig {
  return !('ok' in x && x.ok === false)
}

async function main(): Promise<void> {
  if (!process.env.PAYLOAD_SECRET?.trim()) {
    console.error('Missing PAYLOAD_SECRET in environment.')
    process.exitCode = 1
    return
  }

  const payload = await getPayload({ config })

  const kwRes = await payload.find({
    collection: 'keywords',
    where: { slug: { equals: KEYWORD_SLUG } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const kw = kwRes.docs[0]
  if (!kw) {
    console.error(`Keyword slug not found: ${KEYWORD_SLUG} (run pnpm seed:dev)`)
    process.exitCode = 1
    return
  }

  const kid = typeof kw.id === 'number' ? kw.id : Number(kw.id)
  const term = typeof (kw as { term?: string }).term === 'string' ? (kw as { term: string }).term.trim() : 'topic'
  const siteRaw = (kw as { site?: number | { id: number } | null }).site
  const siteId =
    typeof siteRaw === 'object' && siteRaw?.id != null
      ? siteRaw.id
      : typeof siteRaw === 'number' && Number.isFinite(siteRaw)
        ? siteRaw
        : null
  const tenantRaw = (kw as { tenant?: number | { id: number } | null }).tenant
  const tenantId =
    typeof tenantRaw === 'object' && tenantRaw?.id != null
      ? tenantRaw.id
      : typeof tenantRaw === 'number' && Number.isFinite(tenantRaw)
        ? tenantRaw
        : null

  if (siteId == null || tenantId == null) {
    console.error('Keyword must have site and tenant relations.')
    process.exitCode = 1
    return
  }

  let explicitProfileId: number | undefined
  if (EXPLICIT_PROFILE_ID_RAW && /^\d+$/.test(EXPLICIT_PROFILE_ID_RAW)) {
    explicitProfileId = Number(EXPLICIT_PROFILE_ID_RAW)
  } else {
    const pp = await payload.find({
      collection: 'pipeline-profiles',
      where: {
        and: [{ tenant: { equals: tenantId } }, { slug: { equals: PROFILE_SLUG } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const pid = pp.docs[0]?.id
    if (typeof pid === 'number' && Number.isFinite(pid)) explicitProfileId = pid
  }

  const pipelineCfg = await resolvePipelineConfig({
    payload,
    tenantId,
    siteId,
    explicitProfileId,
  })
  const merged = pipelineCfg.merged
  const variant = normalizeBriefVariant(merged.briefVariant)

  console.error(
    `[pipeline:smoke-article] keyword=${KEYWORD_SLUG} profile=${explicitProfileId ?? PROFILE_SLUG} tenant=${tenantId} site=${siteId}`,
  )

  const bg = await runBriefGeneration({
    payload,
    merged,
    pipelineCfg,
    tenantId,
    siteId,
    keywordId: kid,
    term,
    variant,
  })
  if ('error' in bg) {
    console.error('brief_generate failed:', bg.error)
    process.exitCode = 1
    return
  }
  const briefId = bg.id

  await loadBriefSectionSpecs(payload, briefId)

  const sk = await runDraftSkeletonFromBrief(payload, { briefId, merged })
  if ('error' in sk) {
    console.error('draft_skeleton failed:', sk.error)
    process.exitCode = 1
    return
  }
  const articleId = sk.articleId

  if (explicitProfileId != null) {
    const narrowOk = await d1NarrowUpdate(payload, 'articles', articleId, [
      ['pipeline_profile_id', explicitProfileId],
    ])
    if (!narrowOk) {
      await payload.update({
        collection: 'articles',
        id: String(articleId),
        data: { pipelineProfile: explicitProfileId },
        overrideAccess: true,
      })
    }
  }

  const specs = await loadBriefSectionSpecs(payload, briefId)

  for (const spec of specs) {
    const cfg = await resolvePipelineConfigForArticle(payload, articleId, explicitProfileId ?? undefined)
    if (!isResolvedPipelineConfig(cfg)) {
      console.error('resolvePipelineConfigForArticle:', cfg.error)
      process.exitCode = 1
      return
    }
    const m = cfg.merged
    const sectionType = spec.sectionType
    const model = pickPipelineOpenRouterModel(m, sectionType) || PIPELINE_DEFAULT_OPENROUTER_LLM
    const fbModel = pickFallbackModelFromSectionRetry(m, sectionType)
    const maxRetry = Math.max(1, Math.floor(m.sectionMaxRetry ?? 3))
    const eeatWeights = pickEeatWeightsForContentType(m.eeatWeights, sectionType)

    let previousSectionSummary: string | undefined
    if (m.sectionVariant === 'parallel_with_summary') {
      previousSectionSummary = undefined
    } else if (m.sectionVariant === 'sequential_context') {
      const ex = await excerptFromSequentialPrevious(payload, articleId, briefId, spec.id)
      if (ex) previousSectionSummary = ex
    }

    let globalContext = (await delegateOutlineForBrief(payload, briefId)).trim()
    const wb = wordBudgetHintFromArticleStrategy(m.articleStrategy, sectionType)
    if (wb?.trim()) {
      globalContext = globalContext ? `${globalContext}\n\n${wb}` : wb
    }

    const evidenceSlice = await loadOriginalEvidencePromptSlice(payload, articleId)
    if (evidenceSlice) {
      globalContext = `${globalContext}${buildOriginalEvidenceContextAppendix(evidenceSlice)}`
    }

    let researchSlice: string | undefined
    if (m.sectionVariant === 'research_per_section' && m.tavilyEnabled) {
      const qTail = `${globalContext}`.slice(0, 400)
      try {
        const tv = await tavilySearch({
          query: `${qTail}\nsection "${spec.id}"`.slice(0, 440),
          search_depth: m.frugalMode ? 'basic' : 'advanced',
          max_results: m.frugalMode ? 6 : 10,
          include_raw_content: false,
        })
        researchSlice = JSON.stringify(tv.body ?? {}).slice(0, 8000)
        if (
          !tv.cacheHit &&
          typeof siteId === 'number' &&
          Number.isFinite(siteId)
        ) {
          const credits = extractTavilyUsageCredits(tv.body)
          if (credits != null) {
            try {
              const usd = tavilyCreditsToUsd(credits)
              await incrementSiteQuotaUsage(payload, siteId, {
                tavilyCredits: credits,
                ...(usd > 0 ? { tavilyUsd: usd } : {}),
              })
            } catch {
              /* optional */
            }
          }
        }
      } catch {
        researchSlice = undefined
      }
    }

    const wfRaw = formatSeoWorkflowPromptBlock(m).trim()
    let text = ''
    let lastError: Error | null = null
    let modelUsed = model

    for (let attempt = 0; attempt < maxRetry; attempt += 1) {
      const trialModel = attempt > 0 && fbModel ? fbModel : model
      modelUsed = trialModel
      try {
        const out = await runSectionPrompt(payload, tenantId, {
          model: trialModel,
          sectionId: spec.id,
          sectionType,
          previousSectionSummary,
          globalContext,
          ...(eeatWeights ? { eeatWeights } : {}),
          ...(researchSlice ? { researchSlice } : {}),
          pipelineProfileId: cfg.profileId,
          extraPromptVars: { seo_workflow_block: wfRaw ? `${wfRaw}\n\n` : '' },
        })
        text = out.text
        lastError = null
        break
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e))
        if (attempt === maxRetry - 1) {
          console.error(`draft_section failed section=${spec.id}:`, lastError.message)
          process.exitCode = 1
          return
        }
      }
    }

    const w = await writeSectionIntoArticleBody(payload, {
      articleId,
      sectionId: spec.id,
      sectionMarkdown: text,
      briefId,
    })
    if ('reason' in w) {
      console.error(`writeSection failed section=${spec.id}:`, w.reason)
      process.exitCode = 1
      return
    }

    console.error(`[pipeline:smoke-article] section ok id=${spec.id} model=${modelUsed}`)
  }

  const fin = await runDraftFinalizeForArticle(payload, articleId)
  if (!fin.ok) {
    console.error('draft_finalize failed:', fin)
    process.exitCode = 1
    return
  }

  const article = await payload.findByID({
    collection: 'articles',
    id: String(articleId),
    depth: 0,
    overrideAccess: true,
  })
  const body = (article as { body?: unknown }).body
  const heuristicScore = scoreArticleBodyPublishHeuristic(body)
  const onPageAudit = auditOnPageSeoFormat(
    body,
    onPageSeoFormatRequirements(merged.articleStrategy),
  )
  const score = Math.max(heuristicScore, onPageAudit.score)

  const out = {
    ok: score >= MIN_SCORE && onPageAudit.missing.length === 0,
    articleId,
    briefId,
    score,
    heuristicScore,
    onPageScore: onPageAudit.score,
    minScore: MIN_SCORE,
    onPageMetrics: onPageAudit.metrics,
    onPageMissing: onPageAudit.missing,
  }
  console.log(JSON.stringify(out, null, 2))
  if (!out.ok) {
    console.error(
      `Score ${score} < ${MIN_SCORE} or on-page gate missing requirements. See src/utilities/onPageSeoFormatAudit.ts.`,
    )
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
