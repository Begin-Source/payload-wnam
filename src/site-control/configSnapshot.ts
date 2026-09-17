import { canonicalMasterJSON, masterDigest, masterFields } from './masterSnapshot'
import { assertSiteId } from './registry'
import { assertAssetReference, type AssetReference } from './assetSnapshot'

export const configFields = {
  'admin-branding': ['brandName','primaryColor','supportEmail'],
  'llm-prompts': ['defaultModel','temperature','globalSystemPrompt'],
  'prompt-library': ['entries','skillOverrides'],
  'pipeline-settings': masterFields['pipeline-profiles'].filter(key => !['name','slug','description'].includes(key)),
  'quota-rules': ['rules'],
  'site-quotas': ['name','maxPublishedPages','maxMonthlyAiRuns','dailyPostCap','monthlyTokenBudgetUsd','monthlyImagesBudgetUsd','monthlyDfsCreditBudget'],
} as const
export type ConfigKind = keyof typeof configFields
export type ConfigReference = { kind: ConfigKind; siteId: string; revision: number; digest: string }
export type ConfigSnapshot = { format: 1 | 2; kind: ConfigKind; siteId: string; revision: number; tenantId: number; assets?: { logo: AssetReference | null };
  sourceRecordId: string; sourceUpdatedAt: string; data: Record<string,unknown> }
export type ConfigRelease = ConfigSnapshot & { digest: string; operationId: string; createdAt: string }
export type ConfigBundle = { siteId: string; localSiteId: number; routingVersion: number; centralTenantId: number; release: ConfigRelease }
export function assertConfigKind(kind: string): asserts kind is ConfigKind {
  if (typeof kind !== 'string' || !Object.hasOwn(configFields,kind)) throw new Error('Unsupported versioned configuration')
}
export function configReference(release: ConfigRelease): ConfigReference {
  return { kind: release.kind,siteId: release.siteId,revision: release.revision,digest: release.digest }
}
export function assertConfigReference(ref: ConfigReference): void {
  if (!ref || Object.keys(ref).sort().join(',') !== 'digest,kind,revision,siteId') throw new Error('Invalid configuration reference')
  assertConfigKind(ref.kind)
  if (typeof ref.siteId !== 'string') throw new Error('Invalid configuration site scope')
  if (ref.kind === 'site-quotas') assertSiteId(ref.siteId)
  else if (ref.siteId !== '') throw new Error('Global configuration cannot carry a site scope')
  if (!Number.isSafeInteger(ref.revision) || ref.revision < 1 || typeof ref.digest !== 'string' || !/^[0-9a-f]{64}$/.test(ref.digest)) throw new Error('Invalid configuration revision')
}
function noCredentials(value: unknown): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) { value.forEach(noCredentials); return }
  for (const [key,child] of Object.entries(value)) {
    if (/^(?:api[_-]?key|secret|password|authorization|access[_-]?token|refresh[_-]?token|credentials)$/i.test(key)) throw new Error('Credentials cannot enter configuration releases')
    noCredentials(child)
  }
}
/** Provider/key routing notes and source array IDs never cross databases. */
export function projectConfigData(kind: ConfigKind, source: Record<string,unknown>): Record<string,unknown> {
  assertConfigKind(kind)
  const data = Object.fromEntries(configFields[kind].map(key => [key,source[key] ?? null]))
  if (kind === 'prompt-library') {
    if (data.entries !== null && !Array.isArray(data.entries)) throw new Error('Invalid prompt entries')
    data.entries = ((data.entries ?? []) as Record<string,unknown>[]).map(entry => ({ name: entry.name ?? null,body: entry.body ?? null }))
  }
  canonicalMasterJSON(data); noCredentials(data)
  if (kind === 'site-quotas') for (const key of configFields[kind].filter(key => key !== 'name')) {
    const value = data[key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 ||
      (['maxPublishedPages','maxMonthlyAiRuns','dailyPostCap'].includes(key) && !Number.isSafeInteger(value))) throw new Error('Explicit nonnegative quota policy required')
  }
  return JSON.parse(canonicalMasterJSON(data))
}
export function configSnapshotJSON(value: ConfigSnapshot): string {
  assertConfigReference({ kind: value.kind,siteId: value.siteId,revision: value.revision,digest: '0'.repeat(64) })
  if (![1,2].includes(value.format) || !Number.isSafeInteger(value.tenantId) ||
    (value.kind === 'site-quotas' ? value.tenantId < 1 : value.tenantId !== 0) ||
    typeof value.sourceRecordId !== 'string' || !/^[1-9][0-9]*$/.test(value.sourceRecordId) || !Number.isSafeInteger(Number(value.sourceRecordId)) ||
    new Date(value.sourceUpdatedAt).toISOString() !== value.sourceUpdatedAt) throw new Error('Invalid configuration source')
  if (canonicalMasterJSON(value.data) !== canonicalMasterJSON(projectConfigData(value.kind,value.data))) throw new Error('Invalid configuration fields')
  if (value.format === 2) {
    if (value.kind !== 'admin-branding' || !value.assets || Object.keys(value.assets).join(',') !== 'logo') throw new Error('Invalid branding asset mapping')
    if (value.assets.logo !== null) assertAssetReference(value.assets.logo)
  } else if (value.assets !== undefined || value.kind === 'admin-branding') throw new Error('Branding assets require configuration format 2')
  const json = canonicalMasterJSON({ format: value.format,kind: value.kind,siteId: value.siteId,revision: value.revision,tenantId: value.tenantId,
    sourceRecordId: value.sourceRecordId,sourceUpdatedAt: value.sourceUpdatedAt,data: value.data,...(value.format === 2 ? { assets: value.assets } : {}) })
  if (new TextEncoder().encode(json).length > 128_000) throw new Error('Configuration release too large')
  return json
}
export async function verifyConfigRelease(value: ConfigRelease): Promise<ConfigRelease> {
  const json = configSnapshotJSON(value)
  if (typeof value.operationId !== 'string' || !value.operationId || value.operationId.length > 128 ||
    new Date(value.createdAt).toISOString() !== value.createdAt || await masterDigest(json) !== value.digest) throw new Error('Configuration release integrity mismatch')
  return { ...JSON.parse(json),digest: value.digest,operationId: value.operationId,createdAt: value.createdAt }
}
