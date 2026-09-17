/** Versioned wire format shared by the central publisher and site receiver.
 * Every relationship is pinned to a release, never copied as a local numeric ID.
 */
export const masterFields = {
  'affiliate-networks': ['name','slug','websiteUrl','status','notes'],
  'social-platforms': ['name','slug','status','notes'],
  'site-layouts': ['layoutKey','name','description','previewUrl','sortOrder'],
  authors: ['displayName','slug','role','bioLexical','credentials','sameAs','schemaPersonJsonLd','gdprLawfulBasis','gdprRegion'],
  offers: ['title','slug','status','externalId','targetUrl','commissionNotes','amazon'],
  'pipeline-profiles': ['name','slug','description','tavilyEnabled','dataForSeoEnabled','togetherImageEnabled','defaultLlmModel',
    'defaultImageModel','amazonMarketplace','frugalMode','defaultLocale','defaultRegion','eeatWeights','llmModelsBySection',
    'sectionParallelism','sectionMaxRetry','sectionParallelWhitelist','amzKeywordEligibility','briefVariant','skeletonVariant',
    'briefVariantConfig','sectionVariant','finalizeVariant','skeletonVariantConfig','sectionVariantConfig','finalizeVariantConfig',
    'briefDepth','articleStrategy','sectionRetryStrategy'],
  'keyword-batch-presets': ['name','slug','description','batchMode','defaultBatchLimit','eligibleOnly','intentWhitelist',
    'minVolume','maxVolume','maxKd','maxPick','clusterBeforeEnqueue','clusterMinOverlap','geoIntentWhitelist','geoQuestionOnly',
    'minSeasonalScore','decayThreshold'],
  'tenant-prompt-templates': ['key','body'],
} as const
export type MasterCollection = keyof typeof masterFields
export type MasterReference = { collection: MasterCollection; recordId: string; revision: number; digest: string }
export type MasterSnapshot = {
  format: 1; collection: MasterCollection; recordId: string; revision: number; tenantId: number
  sourceUpdatedAt: string; data: Record<string, unknown>; relations: Record<string, MasterReference | null>
}
export type MasterRelease = MasterSnapshot & { digest: string; operationId: string; createdAt: string }
export type MasterBundle = {
  siteId: string; localSiteId: number; routingVersion: number; centralTenantId: number
  root: MasterReference; releases: MasterRelease[]
}
export const masterRelations: Partial<Record<MasterCollection, Record<string, MasterCollection>>> = {
  offers: { network: 'affiliate-networks' }, 'tenant-prompt-templates': { pipelineProfile: 'pipeline-profiles' },
}
const amazonFields = new Set(['asin','priceCents','currency','ratingAvg','reviewCount','imageUrl','primeEligible','merchantLastSyncedAt'])
const forbiddenKeys = new Set(['__proto__','prototype','constructor'])

export function canonicalMasterJSON(value: unknown, depth = 0): string {
  if (depth > 40) throw new Error('Master snapshot nesting limit exceeded')
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(item => canonicalMasterJSON(item,depth + 1)).join(',') + ']'
  if (value && typeof value === 'object' && [Object.prototype,null].includes(Object.getPrototypeOf(value))) {
    const obj = value as Record<string, unknown>
    return '{' + Object.keys(obj).sort().map(key => {
      if (forbiddenKeys.has(key)) throw new Error('Unsupported master JSON key')
      return JSON.stringify(key) + ':' + canonicalMasterJSON(obj[key],depth + 1)
    }).join(',') + '}'
  }
  throw new Error('Master snapshot must contain finite JSON values')
}
export function assertMasterCollection(collection: string): asserts collection is MasterCollection {
  if (!Object.hasOwn(masterFields,collection)) throw new Error('Unsupported master collection')
}
export function assertMasterReference(ref: MasterReference): void {
  if (!ref || typeof ref !== 'object') throw new Error('Invalid master reference')
  assertMasterCollection(ref.collection)
  if (!/^[1-9][0-9]*$/.test(ref.recordId) || !Number.isSafeInteger(Number(ref.recordId)) || typeof ref.recordId !== 'string' ||
    !Number.isSafeInteger(ref.revision) || ref.revision < 1 || !/^[0-9a-f]{64}$/.test(ref.digest)) throw new Error('Invalid master reference')
}
export function masterReference(release: MasterRelease): MasterReference {
  return { collection: release.collection, recordId: release.recordId, revision: release.revision, digest: release.digest }
}
export function masterKey(ref: Pick<MasterReference,'collection' | 'recordId' | 'revision'>): string {
  return `${ref.collection}/${ref.recordId}/${ref.revision}`
}
function assertNoEmbeddedRelations(value: unknown): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) { value.forEach(assertNoEmbeddedRelations); return }
  const obj = value as Record<string,unknown>
  if ('relationTo' in obj || ['upload','relationship','block','inlineBlock'].includes(String(obj.type)) ||
    (obj.linkType === 'internal') || (obj.fields && typeof obj.fields === 'object' && 'doc' in obj.fields && (obj.fields as { doc?: unknown }).doc != null)) {
    throw new Error('Embedded local relationships require an explicit release mapping')
  }
  Object.values(obj).forEach(assertNoEmbeddedRelations)
}

/** Only data fields may cross the boundary. Slugs remain metadata here; site
 * application must not replace existing content URLs, placements or choices. */
export function projectMasterData(collection: MasterCollection, source: Record<string,unknown>): Record<string,unknown> {
  assertMasterCollection(collection)
  if (collection === 'authors' && source.headshot != null) throw new Error('Author headshot requires the asset export capability')
  const data: Record<string,unknown> = {}
  for (const key of masterFields[collection]) {
    const value = source[key] ?? null
    if (key === 'amazon' && value && typeof value === 'object' && !Array.isArray(value)) {
      data[key] = Object.fromEntries([...amazonFields].map(name => [name,(value as Record<string,unknown>)[name] ?? null]))
    } else data[key] = value
  }
  // Reject embedded Payload relationship/upload nodes. Other JSON remains
  // configuration data and is never interpreted here as a database reference.
  canonicalMasterJSON(data)
  assertNoEmbeddedRelations(data)
  return JSON.parse(canonicalMasterJSON(data)) as Record<string,unknown>
}
export function snapshotJSON(snapshot: MasterSnapshot): string {
  assertMasterReference({ ...snapshot, digest: '0'.repeat(64) })
  if (snapshot.format !== 1 || !Number.isSafeInteger(snapshot.tenantId) || snapshot.tenantId < 0 ||
    (snapshot.collection === 'site-layouts' ? snapshot.tenantId !== 0 : snapshot.tenantId < 1) ||
    new Date(snapshot.sourceUpdatedAt).toISOString() !== snapshot.sourceUpdatedAt) throw new Error('Invalid master snapshot identity')
  const fields = new Set<string>(masterFields[snapshot.collection])
  if (!snapshot.data || Array.isArray(snapshot.data) || Object.keys(snapshot.data).some(key => !fields.has(key)) ||
    Object.keys(snapshot.data).length !== fields.size) throw new Error('Invalid master field allowlist')
  if (canonicalMasterJSON(projectMasterData(snapshot.collection,snapshot.data)) !== canonicalMasterJSON(snapshot.data)) throw new Error('Invalid nested master fields')
  const relationTypes = masterRelations[snapshot.collection] ?? {}
  if (!snapshot.relations || Object.keys(snapshot.relations).length !== Object.keys(relationTypes).length ||
    Object.keys(snapshot.relations).some(key => !Object.hasOwn(relationTypes,key))) throw new Error('Invalid master relation allowlist')
  for (const [key,target] of Object.entries(relationTypes)) {
    const ref = snapshot.relations[key]
    if (ref === null && key === 'pipelineProfile') continue
    assertMasterReference(ref!)
    if (ref!.collection !== target) throw new Error('Master relationship collection mismatch')
  }
  const json = canonicalMasterJSON({ format: 1, collection: snapshot.collection, recordId: snapshot.recordId,
    revision: snapshot.revision, tenantId: snapshot.tenantId, sourceUpdatedAt: snapshot.sourceUpdatedAt,
    data: snapshot.data, relations: snapshot.relations })
  if (new TextEncoder().encode(json).length > 128_000) throw new Error('Master release exceeds byte limit')
  return json
}
export async function masterDigest(json: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(json))),byte => byte.toString(16).padStart(2,'0')).join('')
}
export async function verifyMasterRelease(release: MasterRelease): Promise<MasterRelease> {
  const json = snapshotJSON(release)
  const digest = release.digest, operationId = release.operationId, createdAt = release.createdAt
  if (typeof operationId !== 'string' || !operationId || operationId.length > 128 || new Date(createdAt).toISOString() !== createdAt ||
    await masterDigest(json) !== digest) throw new Error('Master release integrity mismatch')
  return { ...JSON.parse(json), digest, operationId, createdAt } as MasterRelease
}
