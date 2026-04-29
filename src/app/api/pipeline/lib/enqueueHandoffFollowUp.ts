import type { Payload } from 'payload'

import type { WorkflowJob } from '@/payload-types'

type Handoff = {
  recommendedNextSkill?: string | null
  status?: string | null
}

const SKILL_TO_JOB: Record<string, { jobType: string; label: string }> = {
  'alert-manager': { jobType: 'alert_eval', label: 'Handoff: alert baseline' },
  'meta-tags-optimizer': { jobType: 'meta_ab_optimize', label: 'Handoff: meta A/B' },
  'rank-tracker': { jobType: 'rank_track', label: 'Handoff: rank track' },
  'content-refresher': { jobType: 'content_refresh', label: 'Handoff: content refresh' },
  'on-page-seo-auditor': { jobType: 'content_audit', label: 'Handoff: on-page audit' },
}

function handoffFrom(output: unknown): Handoff | null {
  if (!output || typeof output !== 'object') return null
  const o = output as Record<string, unknown>
  const h = o.handoff
  if (h && typeof h === 'object') return h as Handoff
  return null
}

/**
 * 合规钉子 2 — job 完成后按 `handoff.recommendedNextSkill` 自动入队下一环（防重复：同 article+jobType pending 跳过）。
 */
export async function enqueueHandoffFollowUp(
  payload: Payload,
  input: {
    completedJob: { id: string | number; site?: unknown; article?: unknown; handoff?: unknown }
    output: unknown
  },
): Promise<{ created: boolean; jobType?: string }> {
  const merged = {
    ...((input.completedJob.handoff && typeof input.completedJob.handoff === 'object'
      ? input.completedJob.handoff
      : {}) as Handoff),
    ...((handoffFrom(input.output) ?? {}) as Handoff),
  }
  const skill = merged.recommendedNextSkill?.trim()
  if (!skill) return { created: false }

  const mapped = SKILL_TO_JOB[skill]
  if (!mapped) return { created: false }

  const siteId =
    typeof input.completedJob.site === 'object' && input.completedJob.site && 'id' in input.completedJob.site
      ? String((input.completedJob.site as { id: unknown }).id)
      : typeof input.completedJob.site === 'string' || typeof input.completedJob.site === 'number'
        ? String(input.completedJob.site)
        : null
  const articleId =
    typeof input.completedJob.article === 'object' &&
    input.completedJob.article &&
    'id' in input.completedJob.article
      ? String((input.completedJob.article as { id: unknown }).id)
      : typeof input.completedJob.article === 'string' || typeof input.completedJob.article === 'number'
        ? String(input.completedJob.article)
        : null

  const dup = await payload.count({
    collection: 'workflow-jobs',
    where: {
      and: [
        { status: { equals: 'pending' } },
        { jobType: { equals: mapped.jobType } },
        ...(articleId ? [{ article: { equals: articleId } }] : []),
      ],
    },
  })
  if (dup.totalDocs > 0) return { created: false, jobType: mapped.jobType }

  const parentJobId = Number(input.completedJob.id)

  await payload.create({
    collection: 'workflow-jobs',
    data: {
      label: `${mapped.label} (${skill})`.slice(0, 120),
      jobType: mapped.jobType as WorkflowJob['jobType'],
      status: 'pending',
      ...(siteId && /^\d+$/.test(siteId) ? { site: Number(siteId) } : {}),
      ...(articleId && /^\d+$/.test(articleId) ? { article: Number(articleId) } : {}),
      ...(Number.isFinite(parentJobId) ? { parentJob: parentJobId } : {}),
      skillId: skill,
      input: { handoffTriggeredFrom: String(input.completedJob.id), sourceSkill: skill },
      handoff: { status: 'NEEDS_INPUT', objective: `Auto-queued from completed job ${input.completedJob.id}` },
    },
  })
  return { created: true, jobType: mapped.jobType }
}
