import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { tavilySearch } from '@/services/integrations/tavily/client'
import { openrouterChat } from '@/services/integrations/openrouter/chat'
import { appendMemoryBlock } from '@/services/prompts/skillPrompts'
import { fetchKnowledgeMemorySummaries } from '@/utilities/knowledgeMemoryFetch'
import { incrementSiteQuotaUsage } from '@/utilities/siteQuotaCheck'

export const dynamic = 'force-dynamic'

const PATH = '/api/pipeline/brief-generate'

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
  const kw = await payload.findByID({ collection: 'keywords', id: String(body.keywordId) })
  const term = (kw as { term?: string }).term || 'topic'
  const siteId =
    body.siteId ??
    (typeof (kw as { site?: number | { id: number } | null })?.site === 'object' &&
    (kw as { site?: { id: number } | null })?.site
      ? (kw as { site: { id: number } }).site.id
      : (kw as { site?: number | null })?.site) ??
    undefined

  let research: unknown
  try {
    research = await tavilySearch({ query: term, search_depth: 'advanced' })
    if (typeof siteId === 'number' && Number.isFinite(siteId)) {
      try {
        await incrementSiteQuotaUsage(payload, siteId, { tavilyUsd: 0.002 })
      } catch {
        /* optional quota row */
      }
    }
  } catch {
    research = null
  }
  const memoryRows = await fetchKnowledgeMemorySummaries(payload, {
    subject: term,
    skillId: 'serp-analysis',
    limit: 8,
  })
  const system = appendMemoryBlock('serp-analysis', memoryRows)
  const text = await openrouterChat('openai/gpt-4o-mini', [
    { role: 'system', content: system },
    {
      role: 'user',
      content: `Build a content brief outline (sections array + globalContext) for keyword: ${term}. Use research: ${JSON.stringify(research).slice(0, 3000)}`,
    },
  ])
  const kid = typeof body.keywordId === 'number' ? body.keywordId : Number(body.keywordId)
  const outline = {
    sections: [
      { id: 'intro', type: 'intro' as const, wordBudget: 150, inject: { hook: true, valuePromise: true } },
      { id: 'faq', type: 'faq' as const, wordBudget: 300, inject: { parallel: true } },
    ],
    globalContext: { targetKeyword: term, delegateOutline: text.slice(0, 3500) },
  }
  const brief = await payload.create({
    collection: 'content-briefs',
    data: {
      title: `Brief: ${term}`,
      primaryKeyword: kid,
      ...(typeof siteId === 'number' && Number.isFinite(siteId) ? { site: siteId } : {}),
      outline,
      intentSummary: text.slice(0, 2000),
      sources: research == null ? null : (JSON.parse(JSON.stringify(research)) as Record<string, unknown>),
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
