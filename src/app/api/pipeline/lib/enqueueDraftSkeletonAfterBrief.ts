import type { Payload } from 'payload'

/**
 * After a successful `brief_generate` job, enqueue one `draft_skeleton` job (deduped).
 * Returns the new job id or null if skipped or failed (best-effort; swallow errors at caller if needed).
 */
export async function enqueueDraftSkeletonAfterBriefGenerate(
  payload: Payload,
  args: {
    completedBriefJobId: string | number
    briefId: string | number
    siteNumeric: number | null
  },
): Promise<{ created: false; reason: string } | { created: true; id: number }> {
  const { completedBriefJobId, briefId, siteNumeric } = args
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

  const parentId = Number(completedBriefJobId)
  const job = await payload.create({
    collection: 'workflow-jobs',
    data: {
      label: `Draft skeleton → brief #${briefNum}`.slice(0, 120),
      jobType: 'draft_skeleton',
      status: 'pending',
      contentBrief: briefNum,
      ...(Number.isFinite(parentId) ? { parentJob: parentId } : {}),
      input: { briefId: briefNum, chainedFrom: String(completedBriefJobId) },
      ...(siteNumeric != null && Number.isFinite(siteNumeric) ? { site: siteNumeric } : {}),
    },
  })
  return { created: true, id: (job as { id: number }).id }
}
