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
import { resolvePipelineConfigForArticle } from '@/utilities/resolvePipelineConfig'
import { recordOpenRouterAiCost } from '@/utilities/aiCostLog'
import { markdownToPageBodyLexical } from '@/utilities/sitePagesBundleContent/markdownToPayloadLexical'
import { incrementSiteQuotaUsage } from '@/utilities/siteQuotaCheck'
import { tenantIdFromRelation } from '@/utilities/tenantScope'
import {
  extractTavilyUsageCredits,
  tavilyCreditsToUsd,
} from '@/utilities/tavilyUsageCredits'

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

async function finalizePassesToMarkdown(args: {
  payload: Payload
  tenantId: number | null
  model: string
  merged: PipelineSettingShape
  articlePlain: string
  siteId: number | null
  tavSearchQuery: string
}): Promise<{ text: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
  const { payload, tenantId, model, merged, articlePlain } = args
  let md =
    finalizeArticleBodyText(articlePlain)
      .trim()
      .split(/\n\s*\n/)
      .join('\n\n')

  const usageAcc: Record<string, number> = {}

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
    )
    const r = await openrouterChatWithMeta(model, [
      { role: 'system', content: system },
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
      { article_plain: md.slice(0, 32000) },
    )
  }

  if (merged.finalizeVariant === 'eeat_rewrite_pass') {
    md = await runTpl(
      FINALIZE_EEAT_SYSTEM,
      FINALIZE_EEAT_USER,
      buildFinalizeEeatDefaults({ article_md: md.slice(0, 32000) }),
      { article_md: md.slice(0, 32000) },
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
        article_plain: md.slice(0, 14000),
        tavily_slice: tavSlice,
      },
    )
    md = `${md.trim()}\n\n${appendix.trim()}`
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
  const merged: PipelineSettingShape =
    'ok' in cfg && cfg.ok === false ?
      normalizeGlobalPipelineDoc(
        (await payload.findGlobal({ slug: 'pipeline-settings', depth: 0 })) as Record<string, unknown>,
      )
    : (cfg as { merged: PipelineSettingShape }).merged

  const tenantId = tenantIdFromRelation((doc as { tenant?: unknown }).tenant)
  const siteId = siteIdFromArticle(doc)

  const model = pickPipelineOpenRouterModel(merged, 'conclusion')

  const title =
    typeof (doc as { title?: string }).title === 'string' ? (doc as { title: string }).title : ''
  const articlePlain =
    lexicalArticleBodyToPlainText((doc as { body?: Article['body'] }).body ?? null).slice(0, 120000)

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
    await payload.update({
      collection: 'articles',
      id: String(articleIdNum),
      data: {
        body: nextBody,
        ...(excerptSlice ? { excerpt: excerptSlice } : {}),
      },
      overrideAccess: true,
    })
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
  })

  const nextLex = markdownToPageBodyLexical(polishedMd) as Article['body']
  const plain = lexicalArticleBodyToPlainText(nextLex).split(/\n\n/)[0] ?? ''
  const excerptSlice = plain.replace(/\s+/g, ' ').trim().slice(0, 200)

  await payload.update({
    collection: 'articles',
    id: String(articleIdNum),
    data: {
      body: nextLex,
      ...(excerptSlice ? { excerpt: excerptSlice } : {}),
    },
    overrideAccess: true,
  })

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
