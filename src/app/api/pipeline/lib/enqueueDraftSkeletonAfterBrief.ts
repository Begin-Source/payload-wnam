import type { Payload } from 'payload'

import { tenantIdFromRelation } from '@/utilities/tenantScope'

export type TryEnqueueDraftSkeletonResult =
  | { created: false; reason: string }
  | { created: true; id: number }

export type PreviewDraftSkeletonEnqueueResult =
  | { wouldCreate: false; reason: string }
  | { wouldCreate: true }


export async function resolveTenantForDraftSkeletonJob(
  payload: Payload,
  briefNum: number,
  siteNumeric: number | null,
): Promise<number | null> {
  try {
    const brief = await payload.findByID({
      collection: 'content-briefs',
      id: String(briefNum),
      depth: 0,
      overrideAccess: true,
    })
    const fromBrief = tenantIdFromRelation(
      (brief as { tenant?: number | { id: number } | null })?.tenant,
    )
    if (fromBrief != null) return fromBrief
  } catch {
    /* ignore */
  }
  if (siteNumeric != null && Number.isFinite(siteNumeric)) {
    try {
      const site = await payload.findByID({
        collection: 'sites',
        id: String(siteNumeric),
        depth: 0,
        overrideAccess: true,
      })
      return tenantIdFromRelation((site as { tenant?: number | { id: number } | null })?.tenant)
    } catch {
      /* ignore */
    }
  }
  return null
}

/**
 * Same dedupe + tenant rules as {@link tryEnqueueDraftSkeletonJob}, without creating a row.
 */
export async function previewDraftSkeletonEnqueue(
  payload: Payload,
  args: {
    briefId: string | number
    siteNumeric: number | null
    tenantNumeric?: number | null
  },
): Promise<PreviewDraftSkeletonEnqueueResult> {
  const { briefId, siteNumeric, tenantNumeric: tenantArg } = args
  const briefNum =
    typeof briefId === 'number' && Number.isFinite(briefId) ? briefId : Number(briefId)
  if (!Number.isFinite(briefNum)) {
    return { wouldCreate: false, reason: 'invalid_brief_id' }
  }

  const dup = await payload.count({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: 'draft_skeleton' } },
        { status: { in: ['pending', 'running'] } },
        { contentBrief: { equals: briefNum } },
      ],
    },
  })
  if (dup.totalDocs > 0) {
    return { wouldCreate: false, reason: 'draft_skeleton_already_pending' }
  }

  let tenantId: number | null =
    tenantArg != null && Number.isFinite(tenantArg) ? Math.floor(Number(tenantArg)) : null
  if (tenantId == null) {
    tenantId = await resolveTenantForDraftSkeletonJob(payload, briefNum, siteNumeric)
  }
  if (tenantId == null) {
    return { wouldCreate: false, reason: 'missing_tenant_on_brief_or_site' }
  }

  return { wouldCreate: true }
}

/**
 * Deduped enqueue of one `draft_skeleton` workflow job for a content brief.
 * Used by tick after `brief_generate`, admin manual enqueue, and site-scoped bulk.
 *
 * `workflow-jobs` is multi-tenant — `tenant` is required (same as `createWorkflowQuickJob` / `articlePipelineChain`).
 */
export async function tryEnqueueDraftSkeletonJob(
  payload: Payload,
  args: {
    briefId: string | number
    siteNumeric: number | null
    /** When set (e.g. completed `brief_generate` job id), links `parentJob` and `input.chainedFrom`. */
    chainFromJobId?: string | number | null
    /** When set, skips DB lookup. Otherwise tenant is read from the brief, then from the site. */
    tenantNumeric?: number | null
  },
): Promise<TryEnqueueDraftSkeletonResult> {
  const { briefId, siteNumeric, chainFromJobId, tenantNumeric: tenantArg } = args
  const briefNum =
    typeof briefId === 'number' && Number.isFinite(briefId) ? briefId : Number(briefId)
  if (!Number.isFinite(briefNum)) {
    return { created: false, reason: 'invalid_brief_id' }
  }

  const dup = await payload.count({
    collection: 'workflow-jobs',
    where: {
      and: [
        { jobType: { equals: 'draft_skeleton' } },
        { status: { in: ['pending', 'running'] } },
        { contentBrief: { equals: briefNum } },
      ],
    },
  })
  if (dup.totalDocs > 0) {
    return { created: false, reason: 'draft_skeleton_already_pending' }
  }

  let parentId = NaN
  if (chainFromJobId != null) {
    parentId =
      typeof chainFromJobId === 'number' && Number.isFinite(chainFromJobId)
        ? chainFromJobId
        : typeof chainFromJobId === 'string' && /^\d+$/.test(String(chainFromJobId).trim())
          ? Number(String(chainFromJobId).trim())
          : NaN
  }

  const input: Record<string, unknown> =
    chainFromJobId != null
      ? { briefId: briefNum, chainedFrom: String(chainFromJobId) }
      : { briefId: briefNum, source: 'manual_enqueue' }

  let tenantId: number | null =
    tenantArg != null && Number.isFinite(tenantArg) ? Math.floor(Number(tenantArg)) : null
  if (tenantId == null) {
    tenantId = await resolveTenantForDraftSkeletonJob(payload, briefNum, siteNumeric)
  }
  if (tenantId == null) {
    return { created: false, reason: 'missing_tenant_on_brief_or_site' }
  }

  const job = await payload.create({
    collection: 'workflow-jobs',
    data: {
      label: `Draft skeleton → brief #${briefNum}`.slice(0, 120),
      jobType: 'draft_skeleton',
      status: 'pending',
      contentBrief: briefNum,
      tenant: tenantId,
      ...(Number.isFinite(parentId) ? { parentJob: parentId } : {}),
      input,
      ...(siteNumeric != null && Number.isFinite(siteNumeric) ? { site: siteNumeric } : {}),
    },
    overrideAccess: true,
  })
  return { created: true, id: (job as { id: number }).id }
}

/**
 * After a successful `brief_generate` job, enqueue one `draft_skeleton` job (deduped).
 */
export async function enqueueDraftSkeletonAfterBriefGenerate(
  payload: Payload,
  args: {
    completedBriefJobId: string | number
    briefId: string | number
    siteNumeric: number | null
  },
): Promise<TryEnqueueDraftSkeletonResult> {
  const { completedBriefJobId, briefId, siteNumeric } = args
  return tryEnqueueDraftSkeletonJob(payload, {
    briefId,
    siteNumeric,
    chainFromJobId: completedBriefJobId,
  })
}
