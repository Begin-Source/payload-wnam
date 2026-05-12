import type { Payload } from 'payload'

import { openrouterChatWithMeta } from '@/services/integrations/openrouter/chat'
import { finalizeArticleBodyText } from '@/services/writing/finalizePass'
import { lexicalArticleBodyToPlainText } from '@/services/writing/lexicalBodyPlain'
import type { Article } from '@/payload-types'
import { tavilySearch } from '@/services/integrations/tavily/client'
import {
  FINALIZE_COHESION_SYSTEM,
  FINALIZE_COHESION_USER,
  FINALIZE_EEAT_SYSTEM,
  FINALIZE_EEAT_USER,
  FINALIZE_FACT_CHECK_SYSTEM,
  FINALIZE_FACT_CHECK_USER,
  type TenantPromptTemplateKey,
} from '@/utilities/domainGeneration/promptKeys'
import {
  buildFinalizeCohesionDefaults,
  buildFinalizeEeatDefaults,
  buildFinalizeFactCheckDefaults,
} from '@/utilities/openRouterTenantPrompts/defaultOpenRouterTenantPromptBodies'
import { resolveTenantPromptPair } from '@/utilities/openRouterTenantPrompts/loadTenantPromptTemplateBody'
import {
  normalizeGlobalPipelineDoc,
  pickPipelineOpenRouterModel,
  type PipelineSettingShape,
} from '@/utilities/pipelineSettingShape'
import { formatSeoWorkflowPromptBlock } from '@/utilities/seoWorkflowPromptBlock'
import {
  auditOnPageSeoFormat,
  onPageSeoFormatRequirements,
} from '@/utilities/onPageSeoFormatAudit'
import { resolvePipelineConfigForArticle, type ResolvedPipelineConfig } from '@/utilities/resolvePipelineConfig'
import { replaceRegionBlockedOpenRouterModel } from '@/constants/pipelineOpenRouterModels'
import { recordOpenRouterAiCost } from '@/utilities/aiCostLog'
import { d1NarrowUpdateArticle } from '@/utilities/d1NarrowUpdate'
import { markdownToPageBodyLexical } from '@/utilities/sitePagesBundleContent/markdownToPayloadLexical'
import { incrementSiteQuotaUsage } from '@/utilities/siteQuotaCheck'
import { tenantIdFromRelation } from '@/utilities/tenantScope'
import {
  FINALIZE_ARTICLE_BLOCK_BEGIN,
  FINALIZE_ARTICLE_BLOCK_END,
} from '@/utilities/openRouterTenantPrompts/finalizeArticleBlockDelimiters'
import {
  extractTavilyUsageCredits,
  tavilyCreditsToUsd,
} from '@/utilities/tavilyUsageCredits'
import {
  buildOriginalEvidenceContextAppendix,
  loadOriginalEvidencePromptSlice,
} from '@/services/evidence/formatOriginalEvidenceForPrompt'

function siteIdFromArticle(doc: Article | Record<string, unknown>): number | null {
  const raw = (doc as { site?: number | { id: number } | null }).site
  return typeof raw === 'object' && raw?.id != null ?
      raw.id
    : typeof raw === 'number' && Number.isFinite(raw) ? raw
    : null
}

function addTokenUsage(
  acc: Record<string, number>,
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number },
): void {
  if (!usage) return
  if (typeof usage.prompt_tokens === 'number')
    acc.prompt_tokens = (acc.prompt_tokens ?? 0) + usage.prompt_tokens
  if (typeof usage.completion_tokens === 'number')
    acc.completion_tokens = (acc.completion_tokens ?? 0) + usage.completion_tokens
  if (typeof usage.total_tokens === 'number')
    acc.total_tokens = (acc.total_tokens ?? 0) + usage.total_tokens
}

function prependSeoWorkflowBlock(system: string, rawBlock: string): string {
  const block = rawBlock.trim()
  if (!block || system.includes('Parameterized SEO workflow')) return system
  return `${block}\n\n${system}`
}

function buildOnPageSeoRepairPrompt(args: {
  markdown: string
  missing: string[]
  requirementsSummary: string
}): string {
  return [
    'Repair this article Markdown so it satisfies the on-page SEO publishing gate.',
    '',
    'Hard requirements:',
    args.requirementsSummary,
    '',
    'Currently missing:',
    ...args.missing.map((m) => `- ${m}`),
    '',
    'Editing rules:',
    '- Keep the same search intent and factual claims.',
    '- Add useful substance; do not pad with filler.',
    '- Use Markdown only.',
    '- Do not include a # H1; the CMS page title is the only H1.',
    '- Use ## for H2 and ### for H3.',
    '- Include a buyer-facing checklist section and a final recommendation/conclusion.',
    '- Output the complete repaired article Markdown only, no preamble.',
    '',
    FINALIZE_ARTICLE_BLOCK_BEGIN,
    args.markdown.slice(0, 42000),
    FINALIZE_ARTICLE_BLOCK_END,
  ].join('\n')
}

async function finalizePassesToMarkdown(args: {
  payload: Payload
  tenantId: number | null
  model: string
  merged: PipelineSettingShape
  articlePlain: string
  siteId: number | null
  tavSearchQuery: string
  pipelineProfileId?: number | null
  /** When set and finalize uses EEAT pass, original-evidence context is prefixed into article_md. */
  articleId?: number | null
}): Promise<{ text: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
  const { payload, tenantId, model, merged, articlePlain, pipelineProfileId, articleId } = args
  let md =
    finalizeArticleBodyText(articlePlain)
      .trim()
      .split(/\n\s*\n/)
      .join('\n\n')

  const usageAcc: Record<string, number> = {}

  const wfRaw = formatSeoWorkflowPromptBlock(merged).trim()
  const seo_workflow_block = wfRaw ? `${wfRaw}\n\n` : ''

  const runTpl = async (
    systemKey: TenantPromptTemplateKey,
    userKey: TenantPromptTemplateKey,
    defaults: { system: string; user: string },
    vars: Record<string, string>,
  ) => {
    const { system, user } = await resolveTenantPromptPair(
      payload,
      tenantId,
      systemKey,
      userKey,
      defaults,
      vars,
      pipelineProfileId,
    )
    const systemWithWorkflow = prependSeoWorkflowBlock(system, seo_workflow_block)
    const r = await openrouterChatWithMeta(model, [
      { role: 'system', content: systemWithWorkflow },
      { role: 'user', content: user },
    ])
    addTokenUsage(usageAcc, r.usage)
    return r.text.trim()
  }

  if (merged.sectionVariant === 'parallel_with_summary') {
    md = await runTpl(
      FINALIZE_COHESION_SYSTEM,
      FINALIZE_COHESION_USER,
      buildFinalizeCohesionDefaults({ article_plain: md.slice(0, 32000) }),
      { seo_workflow_block, article_plain: md.slice(0, 32000) },
    )
  }

  if (merged.finalizeVariant === 'eeat_rewrite_pass') {
    let articleMdForEeat = md.slice(0, 32000)
    if (typeof articleId === 'number' && Number.isFinite(articleId)) {
      const slice = await loadOriginalEvidencePromptSlice(payload, articleId)
      if (slice) {
        articleMdForEeat = `${buildOriginalEvidenceContextAppendix(slice).trim()}\n\n${articleMdForEeat}`.trim()
      }
    }
    md = await runTpl(
      FINALIZE_EEAT_SYSTEM,
      FINALIZE_EEAT_USER,
      buildFinalizeEeatDefaults({ article_md: articleMdForEeat }),
      { seo_workflow_block, article_md: articleMdForEeat },
    )
  } else if (merged.finalizeVariant === 'fact_check_pass') {
    let tavSlice = '(tavily disabled)'
    let didTavily = false
    if (merged.tavilyEnabled) {
      try {
        const qt = merged.frugalMode ? 'basic' : 'advanced'
        const tv = await tavilySearch({
          query: args.tavSearchQuery.slice(0, 280),
          search_depth: qt,
          max_results: merged.frugalMode ? 5 : 8,
          include_raw_content: false,
        })
        tavSlice = JSON.stringify(tv.body ?? {}).slice(0, 6000)
        didTavily = true
        if (
          !tv.cacheHit &&
          typeof args.siteId === 'number' &&
          Number.isFinite(args.siteId)
        ) {
          const credits = extractTavilyUsageCredits(tv.body)
          if (credits != null) {
            try {
              const usd = tavilyCreditsToUsd(credits)
              await incrementSiteQuotaUsage(payload, args.siteId, {
                tavilyCredits: credits,
                ...(usd > 0 ? { tavilyUsd: usd } : {}),
              })
            } catch {
              /* quota optional */
            }
          }
        }
      } catch {
        tavSlice = '(tavily_error)'
      }
    }
    const appendix = await runTpl(
      FINALIZE_FACT_CHECK_SYSTEM,
      FINALIZE_FACT_CHECK_USER,
      buildFinalizeFactCheckDefaults({
        article_plain: md.slice(0, 14000),
        tavily_slice: tavSlice,
      }),
      {
        seo_workflow_block,
        article_plain: md.slice(0, 14000),
        tavily_slice: tavSlice,
      },
    )
    md = `${md.trim()}\n\n${appendix.trim()}`
  }

  const onPageReq = onPageSeoFormatRequirements(merged.articleStrategy)
  if (onPageReq) {
    for (let repairAttempt = 0; repairAttempt < 2; repairAttempt += 1) {
      const audit = auditOnPageSeoFormat(markdownToPageBodyLexical(md), onPageReq)
      if (audit.missing.length === 0) break
      const requirementsSummary = [
        `- at least ${onPageReq.minWords} body words`,
        `- at least ${onPageReq.minH2Count} ## H2 sections`,
        `- at least ${onPageReq.minH3Count} ### H3 sections`,
        onPageReq.disallowBodyH1 ? '- no # H1 inside the CMS body' : '',
        onPageReq.requireFaqSection ? '- include a ## FAQ section' : '',
        onPageReq.requireChecklistSection ? '- include a checklist section' : '',
      ]
        .filter(Boolean)
        .join('\n')
      const repaired = await openrouterChatWithMeta(model, [
        {
          role: 'system',
          content: prependSeoWorkflowBlock(
            'You are a strict SEO final editor. Repair article Markdown to pass the publishing gate. Output Markdown only.',
            seo_workflow_block,
          ),
        },
        {
          role: 'user',
          content: buildOnPageSeoRepairPrompt({
            markdown: md,
            missing: audit.missing,
            requirementsSummary,
          }),
        },
      ])
      addTokenUsage(usageAcc, repaired.usage)
      md = repaired.text.trim()
    }
  }

  const keys =
    usageAcc.prompt_tokens != null ||
    usageAcc.completion_tokens != null ||
    usageAcc.total_tokens != null
  return {
    text: md,
    ...(keys ?
      {
        usage: {
          prompt_tokens: usageAcc.prompt_tokens ?? 0,
          completion_tokens: usageAcc.completion_tokens ?? 0,
          total_tokens: usageAcc.total_tokens ?? 0,
        },
      }
    : {}),
  }
}

export async function runDraftFinalizeForArticle(
  payload: Payload,
  articleIdNum: number,
): Promise<
  | {
      ok: true
      articleId: number
      excerptChars: number
      finalizeVariant: string
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
      elapsedMs: number
    }
  | { ok: false; error: string; status?: number }
> {
  const t0 = Date.now()
  const doc = await payload.findByID({
    collection: 'articles',
    id: String(articleIdNum),
    depth: 0,
    overrideAccess: true,
  })
  if (!doc) {
    return { ok: false, error: 'article not found', status: 404 }
  }

  const cfg = await resolvePipelineConfigForArticle(payload, articleIdNum, null)
  let merged: PipelineSettingShape
  let pipelineProfileId: number | null = null
  if ('ok' in cfg && cfg.ok === false) {
    merged = normalizeGlobalPipelineDoc(
      (await payload.findGlobal({ slug: 'pipeline-settings', depth: 0 })) as Record<string, unknown>,
    )
  } else {
    const resolved = cfg as ResolvedPipelineConfig
    merged = resolved.merged
    pipelineProfileId = resolved.profileId
  }

  const tenantId = tenantIdFromRelation((doc as { tenant?: unknown }).tenant)
  const siteId = siteIdFromArticle(doc)

  const model = replaceRegionBlockedOpenRouterModel(
    pickPipelineOpenRouterModel(merged, 'conclusion'),
  )

  const title =
    typeof (doc as { title?: string }).title === 'string' ? (doc as { title: string }).title : ''
  const articlePlain =
    lexicalArticleBodyToPlainText((doc as { body?: Article['body'] }).body ?? null).slice(0, 120000)

  if (!articlePlain.trim()) {
    payload.logger.warn(
      { articleId: articleIdNum },
      '[draft_finalize] skipped: body has no extractable plain text',
    )
    return {
      ok: false,
      error:
        'article body has no extractable text for finalize (empty Lexical body, or only unsupported / non-text blocks)',
      status: 422,
    }
  }

  const tavSearchQuery =
    `${title.trim()}\n${articlePlain}`
      .split('\n')[0]
      ?.slice(0, 280)
      ?.trim() || 'verification'

  const lexicalOnly =
    merged.finalizeVariant === 'simple_merge' && merged.sectionVariant !== 'parallel_with_summary'

  if (lexicalOnly) {
    const nextBody = markdownToPageBodyLexical(finalizeArticleBodyText(articlePlain)) as Article['body']
    const plainFirst = lexicalArticleBodyToPlainText(nextBody).split(/\n\n/)[0] ?? ''
    const excerptSlice = plainFirst.replace(/\s+/g, ' ').trim().slice(0, 200)
    const narrowOk = await d1NarrowUpdateArticle(payload, articleIdNum, {
      body: nextBody,
      ...(excerptSlice ? { excerpt: excerptSlice } : {}),
    })
    if (!narrowOk) {
      await payload.update({
        collection: 'articles',
        id: String(articleIdNum),
        data: {
          body: nextBody,
          ...(excerptSlice ? { excerpt: excerptSlice } : {}),
        },
        overrideAccess: true,
      })
    }
    return {
      ok: true,
      articleId: articleIdNum,
      excerptChars: excerptSlice.length,
      finalizeVariant: merged.finalizeVariant,
      elapsedMs: Date.now() - t0,
    }
  }

  const { text: polishedMd, usage } = await finalizePassesToMarkdown({
    payload,
    tenantId,
    model,
    merged,
    articlePlain,
    siteId,
    tavSearchQuery,
    pipelineProfileId,
    articleId: articleIdNum,
  })

  const nextLex = markdownToPageBodyLexical(polishedMd) as Article['body']
  const plain = lexicalArticleBodyToPlainText(nextLex).split(/\n\n/)[0] ?? ''
  const excerptSlice = plain.replace(/\s+/g, ' ').trim().slice(0, 200)

  const narrowOk = await d1NarrowUpdateArticle(payload, articleIdNum, {
    body: nextLex,
    ...(excerptSlice ? { excerpt: excerptSlice } : {}),
  })
  if (!narrowOk) {
    await payload.update({
      collection: 'articles',
      id: String(articleIdNum),
      data: {
        body: nextLex,
        ...(excerptSlice ? { excerpt: excerptSlice } : {}),
      },
      overrideAccess: true,
    })
  }

  try {
    await recordOpenRouterAiCost({
      payload,
      target: { collection: 'articles', id: articleIdNum },
      model,
      usage,
      raw: undefined,
      kind: 'draft_finalize',
    })
  } catch {
    /* optional ledger */
  }

  let orUsd = merged.frugalMode ? 0.03 : 0.08
  if (merged.finalizeVariant === 'fact_check_pass' && merged.tavilyEnabled) {
    orUsd += 0.02
  }
  if (typeof siteId === 'number' && Number.isFinite(siteId)) {
    try {
      await incrementSiteQuotaUsage(payload, siteId, { openrouterUsd: orUsd })
    } catch {
      /* quota optional */
    }
  }

  return {
    ok: true,
    articleId: articleIdNum,
    excerptChars: excerptSlice.length,
    finalizeVariant: merged.finalizeVariant,
    ...(usage ? { usage } : {}),
    elapsedMs: Date.now() - t0,
  }
}
