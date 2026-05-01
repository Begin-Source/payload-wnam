import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { AMZ_DEFAULT_DEVICE } from '@/services/integrations/dataforseo/amzDefaults'
import { dataForSeoPost, keywordDataLocationAndLanguage } from '@/services/integrations/dataforseo/client'
import { tavilySearch } from '@/services/integrations/tavily/client'
import { openrouterChat } from '@/services/integrations/openrouter/chat'
import { appendMemoryBlock } from '@/services/prompts/skillPrompts'
import { fetchKnowledgeMemorySummaries } from '@/utilities/knowledgeMemoryFetch'
import { incrementSiteQuotaUsage } from '@/utilities/siteQuotaCheck'
import { extractSerpBriefContext } from '@/utilities/serpBriefExtract'
import { appendSerpSnapshot } from '@/utilities/serpSnapshotPersist'
import { tenantIdFromRelation } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

const PATH = '/api/pipeline/brief-generate'

const SERP_BRIEF_SYSTEM_ADDON =
  'You are given real Google SERP top-10 organic rows and SERP feature types (when available). ' +
  'Produce a brief outline that can outperform those results for the same query: match dominant intent, ' +
  'cover topical gaps competitors miss, and plan sections that can win SERP features (snippet-style answers, FAQ, comparison tables) where appropriate.'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as { keywordId?: string | number; siteId?: number }
  const payload = await getPayload({ config: configPromise })
  if (!body.keywordId) {
    return Response.json({ error: 'keywordId required' }, { status: 400 })
  }
  const kw = await payload.findByID({
    collection: 'keywords',
    id: String(body.keywordId),
    depth: 0,
    overrideAccess: true,
  })
  const kid = typeof body.keywordId === 'number' ? body.keywordId : Number(body.keywordId)
  if (!Number.isFinite(kid)) {
    return Response.json({ error: 'keywordId invalid' }, { status: 400 })
  }

  const term = (kw as { term?: string }).term || 'topic'
  const siteId =
    body.siteId ??
    (typeof (kw as { site?: number | { id: number } | null })?.site === 'object' &&
    (kw as { site?: { id: number } | null })?.site
      ? (kw as { site: { id: number } }).site.id
      : (kw as { site?: number | null })?.site) ??
    undefined

  let tenantId = tenantIdFromRelation((kw as { tenant?: number | { id: number } | null }).tenant)
  if (tenantId == null && typeof siteId === 'number' && Number.isFinite(siteId)) {
    try {
      const site = await payload.findByID({
        collection: 'sites',
        id: siteId,
        depth: 0,
        overrideAccess: true,
      })
      tenantId = tenantIdFromRelation((site as { tenant?: number | { id: number } | null }).tenant)
    } catch {
      tenantId = null
    }
  }
  if (tenantId == null) {
    return Response.json(
      {
        error:
          typeof siteId === 'number' && Number.isFinite(siteId)
            ? '所选站点未关联租户，无法创建内容大纲'
            : '无法解析租户：请确认关键词与站点已关联租户',
      },
      { status: 400 },
    )
  }

  const locPromise = keywordDataLocationAndLanguage()

  let research: unknown = null
  let serpRaw: unknown = null

  await Promise.all([
    (async () => {
      try {
        research = await tavilySearch({ query: term, search_depth: 'advanced' })
        if (typeof siteId === 'number' && Number.isFinite(siteId)) {
          try {
            await incrementSiteQuotaUsage(payload, siteId, { tavilyUsd: 0.002 })
          } catch {
            /* optional quota */
          }
        }
      } catch {
        research = null
      }
    })(),
    (async () => {
      try {
        const loc = await locPromise
        serpRaw = await dataForSeoPost<unknown>(
          '/v3/serp/google/organic/live/advanced',
          [
            {
              language_code: loc.language_code,
              location_code: loc.location_code,
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
    serpCtx != null &&
    serpRaw != null &&
    typeof siteId === 'number' &&
    Number.isFinite(siteId)
  ) {
    try {
      await incrementSiteQuotaUsage(payload, siteId, { dfs: 1 })
    } catch {
      /* optional quota */
    }
    try {
      const loc = await locPromise
      await appendSerpSnapshot({
        payload,
        keywordId: kid,
        siteId,
        tenantId,
        searchQuery: term,
        locationLabel: String(loc.location_code),
        deviceLabel: AMZ_DEFAULT_DEVICE,
        raw: serpRaw,
      })
    } catch {
      /* non-fatal persistence */
    }
  }

  const serpUserBlock =
    serpCtx == null
      ? 'SERP: unavailable (API error or no organic items). Proceed from Tavily + keyword only.'
      : [
          `SERP feature types observed (non-organic): ${serpCtx.featureTypes.length ? serpCtx.featureTypes.join(', ') : 'none listed'}.`,
          'Top organic (rank — title — domain):',
          ...serpCtx.organicTop10.map((o) => `#${o.rank} — ${o.title} — ${o.domain}`),
        ].join('\n')

  const memoryRows = await fetchKnowledgeMemorySummaries(payload, {
    subject: term,
    skillId: 'serp-analysis',
    limit: 8,
  })
  let system = appendMemoryBlock('serp-analysis', memoryRows)
  system += `\n\n${SERP_BRIEF_SYSTEM_ADDON}`

  const tavSlice = JSON.stringify(research ?? null).slice(0, 2500)
  const userPrompt = [
    `Target keyword: ${term}`,
    '',
    serpUserBlock,
    '',
    `Tavily-style research summary (truncated JSON): ${tavSlice}`,
    '',
    'Return a cohesive content brief: angle, reader job-to-be-done, sections (H2-level), FAQs if useful for snippets, differentiation vs the listed organic URLs.',
  ].join('\n')

  const text = await openrouterChat('openai/gpt-4o-mini', [
    { role: 'system', content: system },
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

  return Response.json({ ok: true, id: brief.id })
}
