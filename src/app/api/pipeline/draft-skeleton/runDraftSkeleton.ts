import type { Payload } from 'payload'

import type { Article } from '@/payload-types'
import { buildLexicalSkeleton } from '@/services/writing/skeletonBuilder'
import { tenantIdFromRelation } from '@/utilities/tenantScope'
import type { PipelineSettingShape } from '@/utilities/pipelineSettingShape'
import { normalizeSkeletonVariant } from '@/utilities/pipelineVariants'
import type { SkeletonVariantId } from '@/utilities/pipelineVariants'
import type { SerpOrganicBriefLine } from '@/utilities/serpBriefExtract'

function slugSectionId(term: string, idx: number): string {
  const raw = term
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
    .trim()
  return raw || `section_${idx}`
}

async function loadClusterSectionRows(
  payload: Payload,
  siteId: number,
  pillarId: number,
): Promise<Array<{ id: number; term: string; volume: number }>> {
  const rows: Array<{ id: number; term: string; volume: number }> = []

  try {
    const direct = await payload.find({
      collection: 'keywords',
      where: {
        and: [
          { site: { equals: siteId } },
          {
            or: [{ id: { equals: pillarId } }, { pillar: { equals: pillarId } }],
          },
        ],
      },
      limit: 24,
      depth: 0,
      overrideAccess: true,
    })
    const seen = new Set<number>()
    for (const d of direct.docs) {
      const id = typeof (d as { id?: unknown }).id === 'number' ? (d as { id: number }).id : Number.NaN
      if (!Number.isFinite(id) || seen.has(id)) continue
      seen.add(id)
      const term = typeof (d as { term?: string }).term === 'string' ? (d as { term: string }).term : ''
      const vRaw = (d as { volume?: number | null }).volume
      const volume = typeof vRaw === 'number' && Number.isFinite(vRaw) ? vRaw : 0
      rows.push({ id, term: term.trim() || `kw_${id}`, volume })
    }
  } catch {
    return []
  }

  rows.sort((a, b) => b.volume - a.volume)
  return rows
}

function top10LinesFromBriefSources(sources: unknown): SerpOrganicBriefLine[] {
  if (!sources || typeof sources !== 'object' || Array.isArray(sources)) return []
  const serp = (sources as { serp?: unknown }).serp
  if (!serp || typeof serp !== 'object' || Array.isArray(serp)) return []
  const top = (serp as { organicTop10?: unknown }).organicTop10
  if (!Array.isArray(top)) return []
  const out: SerpOrganicBriefLine[] = []
  for (const row of top) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const rank = typeof r.rank === 'number' ? r.rank : Number(r.rank) || out.length + 1
    const title = typeof r.title === 'string' ? r.title : ''
    const url = typeof r.url === 'string' ? r.url : ''
    const domain = typeof r.domain === 'string' ? r.domain : ''
    const description = typeof r.description === 'string' ? r.description : null
    if (title || url) out.push({ rank, title, url, domain, description })
  }
  return out.slice(0, 10)
}

export type DraftSkeletonResult = { ok: true; articleId: number } | { ok: false; error: string; status?: number }

export async function runDraftSkeletonFromBrief(
  payload: Payload,
  args: {
    briefId: string | number
    siteIdOverride?: number | null
    merged: PipelineSettingShape
  },
): Promise<DraftSkeletonResult> {
  const merged = args.merged
  const variant: SkeletonVariantId = normalizeSkeletonVariant(merged.skeletonVariant)

  const brief = await payload.findByID({
    collection: 'content-briefs',
    id: String(args.briefId),
    depth: 0,
    overrideAccess: true,
  })
  if (!brief) return { ok: false, error: 'brief not found', status: 404 }

  const briefNum =
    typeof args.briefId === 'number' && Number.isFinite(args.briefId) ? args.briefId : Number(args.briefId)
  const outline = (brief as { outline?: { sections?: { id: string }[]; globalContext?: unknown } }).outline
  const gc = outline?.globalContext as { delegateOutline?: string; targetKeyword?: string } | undefined
  let delegateOutline =
    typeof gc?.delegateOutline === 'string' && gc.delegateOutline.trim()
      ? gc.delegateOutline.trim().slice(0, 12000)
      : ''
  const priorTargetKw = typeof gc?.targetKeyword === 'string' ? gc.targetKeyword : ''

  const b = brief as {
    site?: number | { id: number } | null
    tenant?: number | { id: number } | null
    primaryKeyword?: number | { id: number } | null
    sources?: unknown
    title?: string
  }
  const siteId =
    args.siteIdOverride ??
    (typeof b.site === 'object' && b.site?.id != null
      ? b.site.id
      : typeof b.site === 'number'
        ? b.site
        : undefined)

  let tenantId = tenantIdFromRelation(b.tenant)
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
    return {
      ok: false,
      error:
        typeof siteId === 'number' && Number.isFinite(siteId)
          ? '所选站点未关联租户，无法从 Brief 生成文章草稿'
          : '无法解析租户：请确认内容大纲已关联租户或站点',
      status: 400,
    }
  }

  let pipelineProfileId: number | undefined
  if (typeof siteId === 'number' && Number.isFinite(siteId)) {
    try {
      const siteRow = await payload.findByID({
        collection: 'sites',
        id: String(siteId),
        depth: 0,
        overrideAccess: true,
      })
      const pp = (siteRow as { pipelineProfile?: number | { id: number } | null })?.pipelineProfile
      if (typeof pp === 'number' && Number.isFinite(pp)) pipelineProfileId = pp
      else if (pp && typeof pp === 'object' && 'id' in pp) {
        const id = (pp as { id: number }).id
        if (typeof id === 'number' && Number.isFinite(id)) pipelineProfileId = id
      }
    } catch {
      /* ignore */
    }
  }

  const pk =
    typeof b.primaryKeyword === 'object' && b.primaryKeyword?.id != null
      ? b.primaryKeyword.id
      : typeof b.primaryKeyword === 'number' && Number.isFinite(b.primaryKeyword)
        ? b.primaryKeyword
        : undefined

  if (variant === 'top10_blend' && b.sources) {
    const lines = top10LinesFromBriefSources(b.sources)
    if (lines.length > 0) {
      const block = lines.map((l) => `#${l.rank} ${l.title} (${l.domain || l.url})`).join('\n')
      delegateOutline = `${delegateOutline}\n\nSERP topical titles / competitors to reconcile (union & dedupe in your headings):\n${block}`.slice(
        0,
        12000,
      )
    }
  }

  let ids: string[] = outline?.sections?.map((s) => s.id) || ['intro', 'body', 'faq', 'conclusion']
  let outlineSectionsPayload:
    | Array<{ id: string; type: string; wordBudget?: number }>
    | undefined

  if (
    variant === 'cluster_driven' &&
    typeof siteId === 'number' &&
    Number.isFinite(siteId) &&
    pk != null &&
    Number.isFinite(pk)
  ) {
    const cluster = await loadClusterSectionRows(payload, siteId, pk)
    const picked = cluster.length > 0 ? cluster.slice(0, 12) : []
    if (picked.length >= 2) {
      ids = picked.map((r, i) => slugSectionId(r.term, i))
      outlineSectionsPayload = picked.map((r, i) => ({
        id: slugSectionId(r.term, i),
        type: 'custom',
        wordBudget: 550,
      }))
      const kwLine = picked.map((r) => `- ${r.term}`).join('\n')
      delegateOutline = `${delegateOutline}\n\nCluster keywords (one major H2 per line; internal coverage):\n${kwLine}`.slice(
        0,
        12000,
      )
    }
  }

  const lexical = buildLexicalSkeleton(ids)
  const title = (brief as { title?: string }).title || 'Article'
  const sectionSummaries: Record<string, unknown> =
    delegateOutline.length > 0 ? { globalContext: delegateOutline } : {}

  const art = await payload.create({
    collection: 'articles',
    draft: false,
    data: {
      title: title.replace(/^Brief:\s*/i, ''),
      locale: 'en',
      tenant: tenantId,
      ...(typeof siteId === 'number' && Number.isFinite(siteId) ? { site: siteId } : {}),
      ...(Number.isFinite(briefNum) ? { sourceBrief: briefNum } : {}),
      ...(pk != null ? { primaryKeyword: pk } : {}),
      ...(pipelineProfileId != null ? { pipelineProfile: pipelineProfileId } : {}),
      ...(Object.keys(sectionSummaries).length > 0 ? { sectionSummaries } : {}),
      body: lexical as Article['body'],
      status: 'draft',
    },
  })

  if (variant === 'cluster_driven' && outlineSectionsPayload && outlineSectionsPayload.length >= 2) {
    try {
      await payload.update({
        collection: 'content-briefs',
        id: String(briefNum),
        data: {
          outline: {
            sections: outlineSectionsPayload,
            globalContext: { targetKeyword: priorTargetKw, delegateOutline },
          },
        },
        overrideAccess: true,
      })
    } catch {
      /* non-fatal */
    }
  }

  return { ok: true, articleId: typeof art.id === 'number' ? art.id : Number(art.id) }
}
