import type { Payload } from 'payload'

import { dataForSeoPost, keywordDataLocationAndLanguage } from '@/services/integrations/dataforseo/client'
import { extractDataForSeoCostUsd } from '@/services/integrations/dataforseo/extractDataForSeoCostUsd'
import type { PipelineSettingShape } from '@/utilities/pipelineSettingShape'
import { resolveDfsLocationLanguageFromMerged } from '@/utilities/pipelineDfsLocale'
import { AMZ_DEFAULT_DEVICE } from '@/services/integrations/dataforseo/amzDefaults'
import {
  clusterByOverlap,
  clusterMinPairwiseOverlap,
  extractOrganicTopNormalizedUrls,
  pickPillarForCluster,
  type ClusterOverlapItem,
} from '@/utilities/serpClustering'
import { appendSerpSnapshot, findRecentSerpSnapshotRaw } from '@/utilities/serpSnapshotPersist'
import { tenantIdFromRelation } from '@/utilities/tenantScope'
import { incrementSiteQuotaUsage } from '@/utilities/siteQuotaCheck'

export type KeywordClusterOutputCluster = {
  pillarId: number
  pillarTerm: string
  memberIds: number[]
  memberTerms: string[]
  serpOverlap: number
}

export type KeywordClusterResult = {
  ok: true
  clusters: KeywordClusterOutputCluster[]
  pillarIds: number[]
  totalDfsCalls: number
}

function siteIdFromKw(
  site: number | { id: number } | null | undefined,
): number | null {
  if (site == null) return null
  if (typeof site === 'number' && Number.isFinite(site)) return site
  if (typeof site === 'object' && typeof site.id === 'number') return site.id
  return null
}

export async function runKeywordClusterForSite(args: {
  payload: Payload
  siteId: number
  keywordIds: number[]
  minOverlap: number
  refresh?: boolean
  merged?: PipelineSettingShape | null
  /** Per-keyword DFS timeout ms */
  dfsTimeoutMs?: number
}): Promise<KeywordClusterResult | { ok: false; error: string }> {
  const {
    payload,
    siteId,
    keywordIds,
    minOverlap,
    refresh = false,
    dfsTimeoutMs = 12_000,
  } = args

  const seen = new Set<number>()
  const ids = keywordIds.filter((id) => {
    if (!Number.isFinite(id)) return false
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })

  if (ids.length === 0) {
    return { ok: false, error: 'keywordIds is empty' }
  }

  const site = await payload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 0,
    overrideAccess: true,
  })
  if (!site) {
    return { ok: false, error: 'Site not found' }
  }
  const tenantId = tenantIdFromRelation(
    (site as { tenant?: number | { id: number } | null }).tenant,
  )
  if (tenantId == null) {
    return { ok: false, error: '所选站点未关联租户，无法进行 SERP 聚类' }
  }

  const loc =
    args.merged != null
      ? resolveDfsLocationLanguageFromMerged(args.merged)
      : await keywordDataLocationAndLanguage()
  const locationLabel = String(loc.location_code)
  const deviceLabel = AMZ_DEFAULT_DEVICE

  const overlapItems: ClusterOverlapItem[] = []
  let totalDfsCalls = 0
  let totalCostUsd = 0

  for (const kid of ids) {
    const kw = await payload.findByID({
      collection: 'keywords',
      id: kid,
      depth: 0,
      overrideAccess: true,
    })
    if (!kw) {
      continue
    }
    const kwSite = siteIdFromKw((kw as { site?: number | { id: number } | null }).site)
    if (kwSite !== siteId) {
      continue
    }

    const term = typeof (kw as { term?: string }).term === 'string' ? (kw as { term: string }).term : ''
    if (!term.trim()) {
      continue
    }

    const volumeRaw = (kw as { volume?: number | null }).volume
    const volume =
      typeof volumeRaw === 'number' && Number.isFinite(volumeRaw) ? volumeRaw : null
    const kdRaw = (kw as { keywordDifficulty?: number | null }).keywordDifficulty
    const kd = typeof kdRaw === 'number' && Number.isFinite(kdRaw) ? kdRaw : null
    const eligible = (kw as { eligible?: boolean }).eligible === true
    const existingPillarId = tenantIdFromRelation(
      (kw as { pillar?: number | { id: number } | null }).pillar as
        | number
        | { id: number }
        | null
        | undefined,
    )

    let raw: unknown | null =
      refresh ?
        null
      : await findRecentSerpSnapshotRaw({
          payload,
          keywordId: kid,
          locationLabel,
          deviceLabel,
        })

    if (raw == null) {
      const ac = new AbortController()
      const to = setTimeout(() => ac.abort(), dfsTimeoutMs)
      try {
        raw = await dataForSeoPost<unknown>(
          '/v3/serp/google/organic/live/advanced',
          [
            {
              language_code: loc.language_code,
              location_code: loc.location_code,
              keyword: term,
              calculate_rectangles: false,
            },
          ],
          { signal: ac.signal },
        )
        totalDfsCalls += 1
        totalCostUsd += extractDataForSeoCostUsd(raw)
      } catch {
        raw = null
      } finally {
        clearTimeout(to)
      }

      if (raw != null) {
        await appendSerpSnapshot({
          payload,
          keywordId: kid,
          siteId,
          tenantId,
          searchQuery: term,
          locationLabel,
          deviceLabel,
          raw,
        })
      }
    }

    const urls = raw != null ? extractOrganicTopNormalizedUrls(raw, 10) : []

    overlapItems.push({
      id: kid,
      term,
      volume,
      kd,
      eligible,
      existingPillarId,
      urls,
    })
  }

  if (overlapItems.length === 0) {
    return { ok: false, error: '没有可用于聚类的关键词（站点不匹配或记录不存在）' }
  }

  const groups = clusterByOverlap(overlapItems, minOverlap)
  const clusters: KeywordClusterOutputCluster[] = []
  const pillarIds: number[] = []

  for (const group of groups) {
    const pillarId = pickPillarForCluster(group)
    const pillarRow = group.find((g) => g.id === pillarId) ?? group[0]
    pillarIds.push(pillarId)

    const serpOverlap = clusterMinPairwiseOverlap(group, minOverlap)

    clusters.push({
      pillarId,
      pillarTerm: pillarRow?.term ?? String(pillarId),
      memberIds: group.map((g) => g.id),
      memberTerms: group.map((g) => g.term),
      serpOverlap,
    })

    for (const m of group) {
      await payload.update({
        collection: 'keywords',
        id: m.id,
        data: {
          pillar: m.id === pillarId ? null : pillarId,
        },
        overrideAccess: true,
      })
    }
  }

  if (totalCostUsd > 0) {
    try {
      await incrementSiteQuotaUsage(payload, siteId, { dataForSeoUsd: totalCostUsd })
    } catch {
      /* non-fatal quota */
    }
  }

  return { ok: true, clusters, pillarIds, totalDfsCalls }
}
