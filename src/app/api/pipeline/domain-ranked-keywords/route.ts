import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { dataForSeoPost } from '@/services/integrations/dataforseo/client'
import { extractDataForSeoCostUsd } from '@/services/integrations/dataforseo/extractDataForSeoCostUsd'
import {
  extractRankedKeywordsItems,
  keywordTermFromRankedKeywordItem,
  serpPositionFromRankedKeywordItem,
} from '@/utilities/domainRankedKeywordsParse'
import { resolveDfsLocationLanguageFromMerged } from '@/utilities/pipelineDfsLocale'
import { resolveMergedForPipelineRoute } from '@/utilities/resolvePipelineConfig'
import {
  DataForSeoMatrixEndpoints,
  RankingSource,
  SeoMatrixJsonFields,
} from '@/utilities/seoMatrixPipeline'
import { incrementSiteQuotaUsage } from '@/utilities/siteQuotaCheck'
import { tenantIdFromRelation } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/domain-ranked-keywords'

const RANKED_KW_PATH = DataForSeoMatrixEndpoints.labsGoogleRankedKeywordsLive

function hostnameTargetFromPrimaryDomain(raw: string | null | undefined): string {
  if (!raw?.trim()) return ''
  const u = raw.includes('://') ? raw.trim() : `https://${raw.trim()}`
  try {
    return new URL(u).hostname.replace(/^www\./i, '')
  } catch {
    return raw.replace(/^www\./i, '').split('/')[0]?.trim() ?? ''
  }
}

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }

  const body = (await request.json().catch(() => ({}))) as {
    siteId?: string | number
    target?: string
    limit?: number
    offset?: number
    debugEnvelope?: boolean
  }

  const siteIdRaw = body.siteId
  const siteId =
    typeof siteIdRaw === 'number' ? siteIdRaw : siteIdRaw != null ? Number(siteIdRaw) : NaN
  if (!Number.isFinite(siteId)) {
    return Response.json({ ok: false, error: 'siteId required' }, { status: 400 })
  }

  const limit = Math.min(1000, Math.max(1, Number(body.limit) || 100))
  const offset = Math.min(10_000, Math.max(0, Number(body.offset) || 0))

  const payload = await getPayload({ config: configPromise })
  const site = await payload.findByID({
    collection: 'sites',
    id: String(siteId),
    depth: 0,
    overrideAccess: true,
  })
  if (!site) {
    return Response.json({ ok: false, error: 'Site not found' }, { status: 404 })
  }

  const tenantId = tenantIdFromRelation(
    (site as { tenant?: number | { id: number } | null }).tenant,
  )
  if (tenantId == null) {
    return Response.json({ ok: false, error: 'Site has no tenant' }, { status: 400 })
  }

  const { merged } = await resolveMergedForPipelineRoute({
    payload,
    siteId,
    tenantId,
  })
  if (!merged.dataForSeoEnabled) {
    return Response.json(
      { ok: false, error: 'DataForSEO disabled in pipeline-settings / profile' },
      { status: 400 },
    )
  }

  const loc = resolveDfsLocationLanguageFromMerged(merged)
  const primary = (site as { primaryDomain?: string | null }).primaryDomain
  const target =
    typeof body.target === 'string' && body.target.trim().length > 0
      ? body.target
          .trim()
          .replace(/^www\./i, '')
          .replace(/^https?:\/\//i, '')
          .split('/')[0] ?? ''
      : hostnameTargetFromPrimaryDomain(primary)
  if (!target) {
    return Response.json(
      { ok: false, error: 'Could not derive target domain from site' },
      { status: 400 },
    )
  }

  let envelope: unknown
  try {
    envelope = await dataForSeoPost<unknown>(RANKED_KW_PATH, [
      {
        target,
        location_code: loc.location_code,
        language_code: loc.language_code,
        limit,
        offset,
        item_types: ['organic'],
        historical_serp_mode: 'live',
        include_clickstream_data: false,
        load_rank_absolute: true,
      },
    ])
  } catch (e) {
    return Response.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    })
  }

  const items = extractRankedKeywordsItems(envelope)
  const capturedAt = new Date().toISOString()
  const ingestMeta = {
    source: RankingSource.domainRankedKeywords,
    apiPath: RANKED_KW_PATH,
    capturedAt,
    target,
    location_code: loc.location_code,
    language_code: loc.language_code,
    limit,
    offset,
  }

  const createdIds: (string | number)[] = []
  const skipped: string[] = []

  for (const item of items) {
    const term = keywordTermFromRankedKeywordItem(item)
    if (!term) {
      skipped.push('(empty keyword)')
      continue
    }

    let keywordRel: number | undefined
    try {
      const kwHit = await payload.find({
        collection: 'keywords',
        where: {
          and: [{ site: { equals: siteId } }, { term: { equals: term } }],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const first = kwHit.docs[0] as { id?: number } | undefined
      if (first && typeof first.id === 'number') keywordRel = first.id
    } catch {
      /* optional link */
    }

    const position = serpPositionFromRankedKeywordItem(item)
    const rawSerp = {
      ...item,
      _ingest: ingestMeta,
    } as Record<string, unknown>

    const notes = `自有域名出词（DataForSEO Labs ranked_keywords）| target=${target} | location=${loc.location_code} | lang=${loc.language_code}`

    try {
      const row = await payload.create({
        collection: 'rankings',
        data: {
          searchQuery: term,
          capturedAt,
          site: siteId,
          tenant: tenantId,
          rankingSource: RankingSource.domainRankedKeywords,
          serpPosition: position,
          isAiOverviewHit: false,
          notes,
          ...(keywordRel != null ? { keyword: keywordRel } : {}),
          [SeoMatrixJsonFields.rankingRawSerp]: rawSerp,
        },
        overrideAccess: true,
      })
      createdIds.push(row.id)
    } catch (e) {
      skipped.push(`${term}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  try {
    const usd = extractDataForSeoCostUsd(envelope)
    if (usd > 0) {
      await incrementSiteQuotaUsage(payload, siteId, { dataForSeoUsd: usd })
    }
  } catch {
    /* non-fatal */
  }

  const task0 = (envelope as { tasks?: { result?: { total_count?: number }[] }[] })?.tasks?.[0]
  const result0 = task0?.result?.[0]
  const totalCount =
    result0 && typeof result0 === 'object' && 'total_count' in result0
      ? (result0 as { total_count?: number }).total_count
      : undefined

  return Response.json({
    ok: true,
    target,
    itemsReturned: items.length,
    created: createdIds.length,
    rankingIds: createdIds,
    skipped: skipped.length ? skipped.slice(0, 20) : undefined,
    totalCount,
    hint:
      'Each Labs page is billed separately; use limit/offset for pagination. Triage uses only rankingSource=serp_live.',
    ...(body.debugEnvelope === true ? { envelope } : {}),
  })
}
