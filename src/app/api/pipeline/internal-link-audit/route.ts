import configPromise from '@payload-config'
import type { Where } from 'payload'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { auditAnchorsForSite } from '@/utilities/anchorTextAudit'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/internal-link-audit'

function siteEquals(siteId: string): string | number {
  return /^\d+$/.test(siteId) ? Number(siteId) : siteId
}

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as { siteId?: string; persistKb?: boolean }
  const payload = await getPayload({ config: configPromise })

  const sitePart: Where[] = []
  if (body.siteId && body.siteId !== '0') {
    sitePart.push({ site: { equals: siteEquals(body.siteId) } })
  }

  const LOCATIONS = [
    'body',
    'main_nav',
    'footer',
    'sidebar',
    'related_block',
    'breadcrumb',
    'author_bio',
  ] as const

  const graphBaseWhere: Where = sitePart.length ? { and: sitePart } : {}

  const totalRes = await payload.count({
    collection: 'page-link-graph',
    where: graphBaseWhere,
  })
  const total = totalRes.totalDocs

  const byLocation: Record<string, number> = {}
  for (const loc of LOCATIONS) {
    const locWhere: Where = sitePart.length
      ? { and: [...sitePart, { location: { equals: loc } }] }
      : { location: { equals: loc } }
    const n = await payload.count({
      collection: 'page-link-graph',
      where: locWhere,
    })
    byLocation[loc] = n.totalDocs
  }

  const articleWhere: Where = {
    and: [
      { status: { equals: 'published' } },
      ...(body.siteId && body.siteId !== '0' ? [{ site: { equals: siteEquals(body.siteId) } }] : []),
    ],
  }

  const publishedArticles = await payload.find({
    collection: 'articles',
    where: articleWhere,
    limit: 400,
    depth: 0,
  })

  const orphanIds: string[] = []
  for (const raw of publishedArticles.docs) {
    const a = raw as { id: string | number }
    const inWhere: Where = sitePart.length
      ? {
          and: [
            ...sitePart,
            { toId: { equals: String(a.id) } },
            { toCollection: { equals: 'articles' } },
            { location: { equals: 'body' } },
          ],
        }
      : {
          and: [
            { toId: { equals: String(a.id) } },
            { toCollection: { equals: 'articles' } },
            { location: { equals: 'body' } },
          ],
        }
    const n = await payload.count({
      collection: 'page-link-graph',
      where: inWhere,
    })
    if (n.totalDocs === 0) orphanIds.push(String(a.id))
  }

  let anchorReport: ReturnType<typeof auditAnchorsForSite> | null = null
  if (body.siteId && body.siteId !== '0') {
    const edgesWhere: Where = sitePart.length
      ? { and: [...sitePart, { location: { equals: 'body' } }] }
      : { location: { equals: 'body' } }
    const edgesRes = await payload.find({
      collection: 'page-link-graph',
      where: edgesWhere,
      limit: 5000,
      depth: 0,
    })
    const edges = edgesRes.docs
      .map((d) => {
        const x = d as { toId?: string | null; anchorText?: string | null; anchorType?: string | null }
        return {
          toId: x.toId ? String(x.toId) : '',
          anchorText: x.anchorText,
          anchorType: x.anchorType,
        }
      })
      .filter((e) => e.toId)
    anchorReport = auditAnchorsForSite(body.siteId, edges)
  }

  const structureScore =
    publishedArticles.docs.length > 0
      ? Math.round((total / publishedArticles.docs.length) * 10) / 10
      : 0

  const persistKb = body.persistKb !== false
  if (persistKb) {
    try {
      await payload.create({
        collection: 'knowledge-base',
        data: {
          title: `内链全量审计 · ${body.siteId ?? 'all'}`.slice(0, 200),
          slug: `ilink-audit-${Date.now()}`,
          status: 'published',
          ...(body.siteId && body.siteId !== '0' && /^\d+$/.test(body.siteId)
            ? { site: Number(body.siteId) }
            : {}),
          entryType: 'audit',
          skillId: 'internal-linking-optimizer',
          subject: body.siteId ?? 'all-sites',
          summary: `边 ${total}；正文入链为 0 的页面约 ${orphanIds.length}；结构分(边/文)≈${structureScore}`,
          artifactClass: 'auditor-output',
          severity: orphanIds.length > 50 ? 'warn' : 'info',
          payload: {
            totalEdges: total,
            byLocation,
            orphanCount: orphanIds.length,
            orphanSample: orphanIds.slice(0, 50),
            anchorReport,
            structureScore,
          },
        },
      })
    } catch {
      // KB optional
    }
  }

  return Response.json({
    ok: true,
    siteId: body.siteId ?? null,
    totalEdges: total,
    byLocation,
    structureScore,
    orphanCount: orphanIds.length,
    orphanSample: orphanIds.slice(0, 30),
    overOptimizedAnchors: anchorReport,
    clusterCompliance: 'run /api/pipeline/topic-cluster-audit for pillar rules',
    underLinkedMoneyPages: 'see triage + moneyPageLinkRules',
  })
}
