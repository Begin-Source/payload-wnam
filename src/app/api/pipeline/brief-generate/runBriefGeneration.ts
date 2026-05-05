import type { Payload } from 'payload'

import { AMZ_DEFAULT_DEVICE } from '@/services/integrations/dataforseo/amzDefaults'
import { dataForSeoPost } from '@/services/integrations/dataforseo/client'
import { tavilySearch } from '@/services/integrations/tavily/client'
import { openrouterChat } from '@/services/integrations/openrouter/chat'
import { appendMemoryBlock } from '@/services/prompts/skillPrompts'
import { SERP_BRIEF_SYSTEM, SERP_BRIEF_USER } from '@/utilities/domainGeneration/promptKeys'
import { fetchKnowledgeMemorySummaries } from '@/utilities/knowledgeMemoryFetch'
import { parseBriefVariantConfig } from '@/utilities/pipelineVariants'
import { resolveDfsLocationLanguageFromMerged } from '@/utilities/pipelineDfsLocale'
import type { PipelineSettingShape } from '@/utilities/pipelineSettingShape'
import {
  isPipelineQuickDepth,
  selectLlmModelForSection,
} from '@/utilities/pipelineSettingShape'
import type { ResolvedPipelineConfig } from '@/utilities/resolvePipelineConfig'
import type { BriefVariantId } from '@/utilities/pipelineVariants'
import { buildSerpBriefPromptDefaults } from '@/utilities/openRouterTenantPrompts/defaultOpenRouterTenantPromptBodies'
import { resolveTenantPromptPair } from '@/utilities/openRouterTenantPrompts/loadTenantPromptTemplateBody'
import { SERP_BRIEF_SYSTEM_ADDON } from '@/utilities/openRouterTenantPrompts/serpBriefConstants'
import { incrementSiteQuotaUsage } from '@/utilities/siteQuotaCheck'
import { extractSerpBriefContext } from '@/utilities/serpBriefExtract'
import { appendSerpSnapshot } from '@/utilities/serpSnapshotPersist'

export type BriefGenArgs = {
  payload: Payload
  merged: PipelineSettingShape
  /** Full resolution (used for tagging only downstream). */
  pipelineCfg?: ResolvedPipelineConfig
  tenantId: number
  siteId?: number | null
  keywordId: number
  term: string
}

function depthLabel(merged: PipelineSettingShape): 'quick' | 'standard' | 'deep' {
  if (isPipelineQuickDepth(merged)) return 'quick'
  return merged.briefDepth ?? 'standard'
}

export async function runBriefGeneration(
  args: BriefGenArgs & { variant: BriefVariantId },
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const { payload, merged, tenantId, siteId, keywordId: kid, term } = args
  const variant = args.variant

  const quick = isPipelineQuickDepth(merged)
  const dfsLoc = resolveDfsLocationLanguageFromMerged(merged)
  const depth = depthLabel(merged)
  const briefModel =
    quick || merged.frugalMode ?
      'openai/gpt-4o-mini'
    : selectLlmModelForSection(merged, 'intro')

  const cfgExtras = parseBriefVariantConfig(merged.briefVariantConfig)
  const skipDfs = variant === 'tavily_only' || !merged.dataForSeoEnabled

  let research: unknown = null
  let serpRaw: unknown = null

  const tavilyDepth = (): 'basic' | 'advanced' => {
    if (quick || depth === 'quick') return 'basic'
    if (depth === 'deep') return 'advanced'
    return 'advanced'
  }

  await Promise.all([
    (async () => {
      if (!merged.tavilyEnabled) return
      try {
        if (quick || depth === 'quick') {
          research = await tavilySearch({
            query: term,
            search_depth: 'basic',
            max_results: depth === 'deep' ? 8 : 5,
            include_raw_content: false,
          })
        } else if (depth === 'deep') {
          research = await tavilySearch({
            query: term,
            search_depth: 'advanced',
            max_results: 12,
          })
        } else {
          research = await tavilySearch({
            query: term,
            search_depth: tavilyDepth(),
            max_results: 10,
          })
        }
        if (typeof siteId === 'number' && Number.isFinite(siteId)) {
          try {
            await incrementSiteQuotaUsage(payload, siteId, {
              tavilyUsd:
                quick ?
                  0.0005
                : depth === 'deep' ? 0.004
                : 0.002,
            })
          } catch {
            /* optional quota */
          }
        }
      } catch {
        research = null
      }
    })(),
    (async () => {
      if (skipDfs || quick) return
      if (!merged.dataForSeoEnabled) return
      try {
        serpRaw = await dataForSeoPost<unknown>(
          '/v3/serp/google/organic/live/advanced',
          [
            {
              language_code: dfsLoc.language_code,
              location_code: dfsLoc.location_code,
              keyword: term,
              calculate_rectangles: false,
            },
          ],
        )
      } catch {
        serpRaw = null
      }
    })(),
  ])

  const serpCtx = extractSerpBriefContext(serpRaw)
  if (
    merged.dataForSeoEnabled &&
    serpCtx != null &&
    serpRaw != null &&
    typeof siteId === 'number' &&
    Number.isFinite(siteId) &&
    !skipDfs
  ) {
    try {
      await incrementSiteQuotaUsage(payload, siteId, { dfs: 1 })
    } catch {
      /* optional quota */
    }
    try {
      await appendSerpSnapshot({
        payload,
        keywordId: kid,
        siteId,
        tenantId,
        searchQuery: term,
        locationLabel: String(dfsLoc.location_code),
        deviceLabel: AMZ_DEFAULT_DEVICE,
        raw: serpRaw,
      })
    } catch {
      /* non-fatal persistence */
    }
  }

  let serpUserBlock =
    serpCtx == null
      ? (
        skipDfs ?
          'SERP: DFS skipped by brief variant / settings. Proceed from Tavily + keyword.'
        : 'SERP: unavailable (API error or no organic items). Proceed from Tavily + keyword only.'
      )
      : [
          `SERP feature types observed (non-organic): ${serpCtx.featureTypes.length ? serpCtx.featureTypes.join(', ') : 'none listed'}.`,
          'Top organic (rank — title — domain):',
          ...serpCtx.organicTop10.map((o) => `#${o.rank} — ${o.title} — ${o.domain}`),
        ].join('\n')

  const compN = cfgExtras.competitorCount ?? 3
  if (variant === 'competitor_mimic' && serpCtx != null) {
    const pick = Math.min(compN, serpCtx.organicTop10.length)
    serpUserBlock +=
      `\n\nCompetitor focus (analyze angles & coverage):\n${serpCtx.organicTop10
        .slice(0, pick)
        .map((o, i) => `${i + 1}. ${o.title}\nURL: ${o.url}\nSnippet: ${o.description ?? '(none)'}`)
        .join('\n---\n')}\nPrefer differentiation vs these competitors; cite patterns, not verbatim.`
  }

  const tavSlice = JSON.stringify(research ?? null).slice(0, 2500)

  const memoryRows = await fetchKnowledgeMemorySummaries(payload, {
    subject: term,
    skillId: 'serp-analysis',
    limit: 8,
  })
  const memory_block = appendMemoryBlock('serp-analysis', memoryRows)
  const serp_brief_addon = SERP_BRIEF_SYSTEM_ADDON
  const briefVars = {
    memory_block,
    serp_brief_addon,
    term,
    serp_user_block: serpUserBlock,
    tavily_slice: tavSlice,
  }
  const briefDefaults = buildSerpBriefPromptDefaults({
    memory_block,
    serp_user_block: serpUserBlock,
    tavily_slice: tavSlice,
    term,
  })
  const { system: briefSystem, user: userPrompt } = await resolveTenantPromptPair(
    payload,
    tenantId,
    SERP_BRIEF_SYSTEM,
    SERP_BRIEF_USER,
    briefDefaults,
    briefVars,
  )

  const text = await openrouterChat(briefModel, [
    { role: 'system', content: briefSystem },
    { role: 'user', content: userPrompt },
  ])
  const outline = {
    sections: [
      { id: 'intro', type: 'intro' as const, wordBudget: 150, inject: { hook: true, valuePromise: true } },
      { id: 'faq', type: 'faq' as const, wordBudget: 300, inject: { parallel: true } },
    ],
    globalContext: { targetKeyword: term, delegateOutline: text.slice(0, 3500) },
  }

  const sources: Record<string, unknown> = {}
  if (research != null) {
    try {
      sources.tavily = JSON.parse(JSON.stringify(research)) as Record<string, unknown>
    } catch {
      sources.tavily = { note: 'tavily_serialization_failed', rawString: String(research).slice(0, 500) }
    }
  }
  if (serpCtx != null) {
    sources.serp = {
      fetchedAt: new Date().toISOString(),
      organicTop10: serpCtx.organicTop10,
      featureTypes: serpCtx.featureTypes,
    }
  }

  const brief = await payload.create({
    collection: 'content-briefs',
    data: {
      title: `Brief: ${term}`,
      primaryKeyword: kid,
      tenant: tenantId,
      ...(typeof siteId === 'number' && Number.isFinite(siteId) ? { site: siteId } : {}),
      outline,
      intentSummary: text.slice(0, 2000),
      sources: Object.keys(sources).length > 0 ? sources : null,
      status: 'draft',
    },
  })

  if (typeof siteId === 'number' && Number.isFinite(siteId)) {
    try {
      await incrementSiteQuotaUsage(payload, siteId, { openrouterUsd: 0.025 })
    } catch {
      /* quota row optional */
    }
  }

  return { ok: true, id: typeof brief.id === 'number' ? brief.id : Number(brief.id) }
}
