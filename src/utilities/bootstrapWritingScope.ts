import type { Payload } from 'payload'

import { enqueueArticlePipelineCatchup } from '@/app/api/pipeline/lib/articlePipelineChain'
import { tryEnqueueDraftSkeletonJob } from '@/app/api/pipeline/lib/enqueueDraftSkeletonAfterBrief'
import type { Config } from '@/payload-types'
import { tenantIdFromRelation } from '@/utilities/tenantScope'

export type ResolvedWritingScopeForBootstrap = {
  articleId: number | null
  briefId: number | null
}

export type BootstrapWritingScopeResult = {
  /** True when at least one new workflow job was created or catchup reported new enqueues. */
  created: boolean
  summaries: string[]
  error?: string
}

function siteIdFromBriefDoc(brief: unknown): number | null {
  const b = brief as { site?: number | { id: number } | null } | null
  if (!b) return null
  const s = b.site
  if (typeof s === 'object' && s !== null && 'id' in s && typeof (s as { id: number }).id === 'number') {
    return (s as { id: number }).id
  }
  if (typeof s === 'number' && Number.isFinite(s)) return s
  return null
}

const DRAFT_SKELETON_REASON_LABEL: Record<string, string> = {
  invalid_brief_id: '无效的大纲 ID',
  draft_skeleton_already_pending: '该大纲已有进行中的 draft_skeleton 任务',
  missing_tenant_on_brief_or_site: '大纲或站点未关联租户，无法入队',
}

/**
 * When writing scope has no pending seeds: enqueue `draft_skeleton` (brief only, no article yet)
 * or `enqueueArticlePipelineCatchup` (article exists for scope).
 * Does **not** enqueue `brief_generate` (that path always creates a new content-brief row).
 */
export async function bootstrapWritingScopeIfIdle(
  payload: Payload,
  user: Config['user'],
  scope: ResolvedWritingScopeForBootstrap,
): Promise<BootstrapWritingScopeResult> {
  const summaries: string[] = []
  let created = false

  const uid = scope.articleId
  const bid = scope.briefId

  if (uid != null && Number.isFinite(uid)) {
    const catchup = await enqueueArticlePipelineCatchup(payload, Math.floor(uid))
    if (!catchup.ok) {
      return { created: false, summaries, error: catchup.error }
    }
    summaries.push(...catchup.messages)
    created = catchup.messages.some((m) => m.includes('入队'))
    return { created, summaries }
  }

  if (bid == null || !Number.isFinite(bid)) {
    return { created: false, summaries, error: '无法解析 articleId 或 briefId' }
  }

  const briefNum = Math.floor(bid)

  const articlesRes = await payload.find({
    collection: 'articles',
    where: { sourceBrief: { equals: briefNum } },
    sort: '-createdAt',
    limit: 2,
    depth: 0,
    user,
    overrideAccess: false,
  })

  if (articlesRes.totalDocs > 1) {
    summaries.push(
      `注意：${articlesRes.totalDocs} 篇文章关联同一大纲 #${briefNum}，已对最新一条执行补跑（catchup）。`,
    )
  }

  const first = articlesRes.docs[0] as { id?: unknown } | undefined
  if (first && typeof first.id === 'number' && Number.isFinite(first.id)) {
    const catchup = await enqueueArticlePipelineCatchup(payload, first.id)
    if (!catchup.ok) {
      return { created: false, summaries, error: catchup.error }
    }
    summaries.push(...catchup.messages)
    created = catchup.messages.some((m) => m.includes('入队'))
    return { created, summaries }
  }

  let brief
  try {
    brief = await payload.findByID({
      collection: 'content-briefs',
      id: String(briefNum),
      depth: 0,
      user,
      overrideAccess: false,
    })
  } catch {
    brief = null
  }
  if (!brief) {
    return {
      created: false,
      summaries,
      error: '内容大纲不存在或无权访问',
    }
  }

  const siteNumeric = siteIdFromBriefDoc(brief)
  const tenantNumeric = tenantIdFromRelation(
    (brief as { tenant?: number | { id: number } | null }).tenant,
  )

  const sk = await tryEnqueueDraftSkeletonJob(payload, {
    briefId: briefNum,
    siteNumeric: siteNumeric != null && Number.isFinite(siteNumeric) ? siteNumeric : null,
    ...(tenantNumeric != null ? { tenantNumeric } : {}),
  })

  if (sk.created) {
    summaries.push(`入队 draft_skeleton，job #${sk.id}`)
    created = true
  } else {
    const label = DRAFT_SKELETON_REASON_LABEL[sk.reason] ?? sk.reason
    summaries.push(`未入队 draft_skeleton：${label}`)
  }

  return { created, summaries }
}
