import type { PipelineSettingShape } from '@/utilities/pipelineSettingShape'
import type { ResolvedPipelineSource } from '@/utilities/resolvePipelineConfig'

/** Enriched `workflow-jobs.input` for KPI / A/B (best-effort; optional fields omitted when null). */
export function pipelineWorkflowVariantTags(opts: {
  merged: PipelineSettingShape
  profileSlug: string | null
  source: ResolvedPipelineSource
}): Record<string, string | undefined> {
  return {
    ...(opts.profileSlug != null && opts.profileSlug.trim() ?
      { pipelineProfileSlug: opts.profileSlug.trim() }
    : {}),
    pipelineProfileSource: opts.source,
    briefVariant: opts.merged.briefVariant,
    skeletonVariant: opts.merged.skeletonVariant,
    sectionVariant: opts.merged.sectionVariant,
    finalizeVariant: opts.merged.finalizeVariant,
  }
}

export function compactPipelineWorkflowTags(tags: Record<string, string | undefined>): Record<string, string> {
  const o: Record<string, string> = {}
  for (const [k, v] of Object.entries(tags)) {
    if (v != null && v !== '') o[k] = v
  }
  return o
}
