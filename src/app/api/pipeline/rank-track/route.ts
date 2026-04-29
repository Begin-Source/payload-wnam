import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { dataForSeoPost, keywordDataLocationAndLanguage } from '@/services/integrations/dataforseo/client'
import { parseOrganicPositionAndAiOverview } from '@/utilities/dataForSeoOrganicParse'
import { DataForSeoMatrixEndpoints, SeoMatrixJsonFields } from '@/utilities/seoMatrixPipeline'
import { incrementSiteQuotaUsage } from '@/utilities/siteQuotaCheck'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/rank-track'

function hostnameFromPrimaryDomain(raw: string | null | undefined): string {
  if (!raw?.trim()) return ''
  const u = raw.includes('://') ? raw.trim() : `https://${raw.trim()}`
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return raw.replace(/^www\./, '').split('/')[0] ?? ''
  }
}

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as {
    keyword?: string
    keywordId?: string | number
    siteId?: string | number
  }
  const loc = await keywordDataLocationAndLanguage()
  const payload = await getPayload({ config: configPromise })

  let searchQuery = typeof body.keyword === 'string' ? body.keyword.trim() : ''
  let keywordRel: number | undefined
  let siteRel: number | undefined
  let tenantRel: number | undefined
  let matchHost = ''

  if (body.keywordId != null) {
    const kid = typeof body.keywordId === 'number' ? body.keywordId : Number(body.keywordId)
    if (Number.isFinite(kid)) {
      try {
        const kw = await payload.findByID({ collection: 'keywords', id: String(kid), depth: 1 })
        keywordRel = kid
        if (!searchQuery) searchQuery = (kw as { term?: string }).term?.trim() || ''
        const s = (kw as { site?: number | { id: number } | null }).site
        const sid = typeof s === 'object' && s?.id != null ? s.id : typeof s === 'number' ? s : undefined
        if (sid != null && Number.isFinite(sid)) {
          siteRel = sid
          const site = typeof s === 'object' && s && 'primaryDomain' in s ? s : await payload.findByID({ collection: 'sites', id: String(sid), depth: 0 })
          matchHost = hostnameFromPrimaryDomain((site as { primaryDomain?: string }).primaryDomain)
          const t = (site as { tenant?: number | { id: number } | null }).tenant
          tenantRel =
            typeof t === 'object' && t && 'id' in t ? (t as { id: number }).id : typeof t === 'number' ? t : undefined
        }
      } catch {
        // fall through
      }
    }
  }

  if (body.siteId != null && siteRel == null) {
    const sid = typeof body.siteId === 'number' ? body.siteId : Number(body.siteId)
    if (Number.isFinite(sid)) {
      siteRel = sid
      try {
        const site = await payload.findByID({ collection: 'sites', id: String(sid), depth: 0 })
        matchHost = hostnameFromPrimaryDomain((site as { primaryDomain?: string }).primaryDomain)
        const t = (site as { tenant?: number | { id: number } | null }).tenant
        tenantRel =
          typeof t === 'object' && t && 'id' in t ? (t as { id: number }).id : typeof t === 'number' ? t : undefined
      } catch {
        /* ignore */
      }
    }
  }

  if (!searchQuery) {
    return Response.json({ error: 'keyword or keywordId required' }, { status: 400 })
  }

  try {
    const r = await dataForSeoPost(DataForSeoMatrixEndpoints.serpGoogleOrganicLive, [
      {
        language_code: loc.language_code,
        location_code: loc.location_code,
        keyword: searchQuery,
        depth: 10,
      },
    ])

    const { position, isAiOverviewHit } = parseOrganicPositionAndAiOverview(r, matchHost || 'localhost')
    const capturedAt = new Date().toISOString()

    let change: number | null = null
    if (keywordRel != null && siteRel != null && position != null) {
      const prev = await payload.find({
        collection: 'rankings',
        where: {
          and: [{ keyword: { equals: keywordRel } }, { site: { equals: siteRel } }],
        },
        sort: '-capturedAt',
        limit: 1,
        depth: 0,
      })
      const last = prev.docs[0] as { serpPosition?: number | null } | undefined
      if (last && typeof last.serpPosition === 'number') {
        change = last.serpPosition - position
      }
    }

    const ranking = await payload.create({
      collection: 'rankings',
      data: {
        searchQuery,
        capturedAt,
        ...(keywordRel != null ? { keyword: keywordRel } : {}),
        ...(siteRel != null ? { site: siteRel } : {}),
        ...(tenantRel != null && Number.isFinite(tenantRel) ? { tenant: tenantRel } : {}),
        serpPosition: position,
        isAiOverviewHit,
        [SeoMatrixJsonFields.rankingRawSerp]: r as unknown as Record<string, unknown>,
        ...(change != null ? { change } : {}),
      },
      overrideAccess: true,
    })

    if (siteRel != null && Number.isFinite(siteRel)) {
      try {
        await incrementSiteQuotaUsage(payload, siteRel, { dfs: 1 })
      } catch {
        /* non-fatal */
      }
    }

    return Response.json({
      ok: true,
      rankingId: ranking.id,
      serpPosition: position,
      isAiOverviewHit,
      r,
      handoff: {
        status: 'DONE',
        objective: 'Rank snapshot persisted to rankings',
        recommendedNextSkill: 'alert-manager',
        keyFindings: `Ranking #${ranking.id}; position=${position ?? 'n/a'}; baseline thresholds can be written in alert_eval.`,
      },
    })
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) })
  }
}
