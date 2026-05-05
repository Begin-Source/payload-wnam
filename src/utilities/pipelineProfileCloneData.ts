import type { PipelineProfile } from '@/payload-types'

/** Fields copied when cloning a `pipeline-profiles` document (omit id/timestamps). */
const CLONE_FIELD_KEYS = [
  'description',
  'tavilyEnabled',
  'dataForSeoEnabled',
  'togetherImageEnabled',
  'defaultLlmModel',
  'defaultImageModel',
  'amazonMarketplace',
  'frugalMode',
  'defaultLocale',
  'defaultRegion',
  'eeatWeights',
  'llmModelsBySection',
  'sectionParallelism',
  'sectionMaxRetry',
  'sectionParallelWhitelist',
  'amzKeywordEligibility',
  'briefVariant',
  'skeletonVariant',
  'briefVariantConfig',
  'sectionVariant',
  'finalizeVariant',
  'skeletonVariantConfig',
  'sectionVariantConfig',
  'finalizeVariantConfig',
  'briefDepth',
  'articleStrategy',
  'sectionRetryStrategy',
] as const satisfies readonly (keyof PipelineProfile)[]

export function buildPipelineProfileClonePayload(
  src: PipelineProfile,
  next: { name: string; slug: string; isDefault: boolean },
): Record<string, unknown> {
  const tenantRel = src.tenant
  const out: Record<string, unknown> = {
    tenant:
      typeof tenantRel === 'object' && tenantRel?.id != null ? tenantRel.id : tenantRel,
    name: next.name,
    slug: next.slug,
    isDefault: next.isDefault,
  }
  for (const key of CLONE_FIELD_KEYS) {
    const v = src[key]
    if (v !== undefined) out[key] = v as unknown
  }
  return out
}
