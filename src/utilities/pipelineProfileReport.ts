import type { Payload, Where } from 'payload'

/** Quick-win article chain job types tagged with `pipelineProfileSlug` / `pipelineProfileId`. */
export const PIPELINE_REPORT_JOB_TYPES = [
  'brief_generate',
  'draft_skeleton',
  'draft_section',
  'draft_finalize',
  'image_generate',
] as const

export type PipelineReportJobType = (typeof PIPELINE_REPORT_JOB_TYPES)[number]

export type PipelineProfileReportSummary = {
  profileId: number
  slug: string
  name: string
  tenantId: number | null
  window: { sinceIso: string; untilIso: string }
  workflow: {
    consideredJobs: number
    matchedJobs: number
    byStatus: Record<string, number>
    byType: Record<string, number>
    failedRate: number
    avgDurationMs: number | null
    durationSamples: number
    sumPromptTokens: number
    sumCompletionTokens: number
    jobsWithTokenUsage: number
  }
  articles: {
    matchedBySnapshotSlug: number
    avgQualityScore: number | null
    avgCurrentPosition: number | null
    positionSamples: number
  }
}

function asRecord(u: unknown): Record<string, unknown> | null {
  return u && typeof u === 'object' && !Array.isArray(u) ? (u as Record<string, unknown>) : null
}

export function workflowJobMatchesProfile(
  input: unknown,
  slug: string,
  profileId: number,
): boolean {
  const o = asRecord(input)
  if (!o) return false
  const ps = typeof o.pipelineProfileSlug === 'string' ? o.pipelineProfileSlug.trim() : ''
  if (ps && slug && ps.toLowerCase() === slug.trim().toLowerCase()) return true
  const raw = o.pipelineProfileId
  const pid =
    typeof raw === 'number' ? raw
    : typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw.trim())
    : NaN
  return Number.isFinite(pid) && Math.floor(pid) === profileId
}

function telemetryFromOutput(out: unknown): {
  elapsedMs?: number
  prompt?: number
  completion?: number
} {
  const o = asRecord(out)
  if (!o) return {}
  let elapsedMs: number | undefined
  const e = o.elapsedMs
  if (typeof e === 'number' && Number.isFinite(e)) elapsedMs = e
  const usage = asRecord(o.usage)
  let prompt: number | undefined
  let completion: number | undefined
  if (usage) {
    const pt = usage.prompt_tokens
    const ct = usage.completion_tokens
    if (typeof pt === 'number' && Number.isFinite(pt)) prompt = pt
    if (typeof ct === 'number' && Number.isFinite(ct)) completion = ct
  }
  return { elapsedMs, prompt, completion }
}

function msFromJobDates(job: {
  startedAt?: string | null
  completedAt?: string | null
}): number | undefined {
  const a = job.startedAt ? Date.parse(job.startedAt) : NaN
  const b = job.completedAt ? Date.parse(job.completedAt) : NaN
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return undefined
  return b - a
}

/**
 * KPI report for one pipeline profile (tagged workflow jobs + articles with snapshot slug).
 */
export async function buildPipelineProfileReport(args: {
  payload: Payload
  profile: {
    id: number
    slug?: string | null
    name?: string | null
    tenant?: number | { id: number } | null
  }
  since: Date
}): Promise<PipelineProfileReportSummary> {
  const { payload, profile, since } = args
  const profileId =
    typeof profile.id === 'number' && Number.isFinite(profile.id) ? Math.floor(profile.id) : NaN
  const slug =
    typeof profile.slug === 'string' && profile.slug.trim() ?
      profile.slug.trim().toLowerCase()
    : ''
  const name = typeof profile.name === 'string' ? profile.name : String(profile.id)
  const tenantRaw = profile.tenant
  const tenantId =
    typeof tenantRaw === 'object' && tenantRaw?.id != null ?
      tenantRaw.id
    : typeof tenantRaw === 'number' && Number.isFinite(tenantRaw) ?
      tenantRaw
    : null

  const untilIso = new Date().toISOString()
  const sinceIso = since.toISOString()

  const whereJobs: Where = {
    and: [
      {
        updatedAt: {
          greater_than_equal: sinceIso,
        },
      },
      {
        jobType: {
          in: [...PIPELINE_REPORT_JOB_TYPES],
        },
      },
    ],
  }

  let page = 1
  let hasMore = true
  let consideredJobs = 0
  const byStatus: Record<string, number> = {}
  const byType: Record<string, number> = {}
  let matchedJobs = 0
  let durationSum = 0
  let durationSamples = 0
  let sumPromptTokens = 0
  let sumCompletionTokens = 0
  let jobsWithTokenUsage = 0
  let terminalFailed = 0
  let terminalDone = 0

  while (hasMore && page <= 40) {
    const res = await payload.find({
      collection: 'workflow-jobs',
      where: whereJobs,
      limit: 250,
      page,
      depth: 0,
      overrideAccess: true,
      sort: '-updatedAt',
    })

    for (const d of res.docs) {
      consideredJobs += 1
      const doc = d as {
        status?: string
        jobType?: string
        input?: unknown
        output?: unknown
        startedAt?: string | null
        completedAt?: string | null
      }
      const st = typeof doc.status === 'string' ? doc.status : 'unknown'
      byStatus[st] = (byStatus[st] ?? 0) + 1
      const jt = typeof doc.jobType === 'string' ? doc.jobType : ''
      byType[jt] = (byType[jt] ?? 0) + 1

      if (!workflowJobMatchesProfile(doc.input, slug, profileId)) continue
      matchedJobs += 1
      const tel = telemetryFromOutput(doc.output)
      if (tel.elapsedMs != null) {
        durationSum += tel.elapsedMs
        durationSamples += 1
      } else {
        const ms = msFromJobDates(doc)
        if (ms != null) {
          durationSum += ms
          durationSamples += 1
        }
      }
      if (tel.prompt != null || tel.completion != null) jobsWithTokenUsage += 1
      if (tel.prompt != null) sumPromptTokens += tel.prompt
      if (tel.completion != null) sumCompletionTokens += tel.completion

      if (doc.status === 'failed') terminalFailed += 1
      if (doc.status === 'completed') terminalDone += 1
    }

    hasMore = res.hasNextPage === true
    page += 1
    if (res.docs.length === 0) hasMore = false
  }

  const denom = terminalFailed + terminalDone
  const failedRate = denom > 0 ? terminalFailed / denom : 0

  /** Articles attributed to this profile via frozen snapshot slug. */
  const artWhere: Where =
    slug ?
      ({
        and: [
          { pipelineProfileSlug: { equals: slug } },
          ...(tenantId != null ? [{ tenant: { equals: tenantId } }] : []),
        ],
      } satisfies Where)
    : ({ id: { equals: 0 } } satisfies Where)

  let matchedArticles = 0
  let qSum = 0
  let qCount = 0
  let pSum = 0
  let pCount = 0

  if (slug) {
    let ap = 1
    let aMore = true
    while (aMore && ap <= 20) {
      const ar = await payload.find({
        collection: 'articles',
        where: artWhere,
        limit: 200,
        page: ap,
        depth: 0,
        overrideAccess: true,
      })
      matchedArticles += ar.docs.length
      for (const a of ar.docs) {
        const row = a as { qualityScore?: number | null; currentPosition?: number | null }
        if (typeof row.qualityScore === 'number' && Number.isFinite(row.qualityScore)) {
          qSum += row.qualityScore
          qCount += 1
        }
        if (typeof row.currentPosition === 'number' && Number.isFinite(row.currentPosition)) {
          pSum += row.currentPosition
          pCount += 1
        }
      }
      aMore = ar.hasNextPage === true && ar.docs.length > 0
      ap += 1
    }
  }

  return {
    profileId,
    slug,
    name,
    tenantId,
    window: { sinceIso, untilIso },
    workflow: {
      consideredJobs,
      matchedJobs,
      byStatus,
      byType,
      failedRate,
      avgDurationMs: durationSamples ? Math.round(durationSum / durationSamples) : null,
      durationSamples,
      sumPromptTokens,
      sumCompletionTokens,
      jobsWithTokenUsage,
    },
    articles: {
      matchedBySnapshotSlug: matchedArticles,
      avgQualityScore:
        qCount ? Math.round((qSum / qCount + Number.EPSILON) * 100) / 100 : null,
      avgCurrentPosition:
        pCount ? Math.round((pSum / pCount + Number.EPSILON) * 100) / 100 : null,
      positionSamples: pCount,
    },
  }
}
