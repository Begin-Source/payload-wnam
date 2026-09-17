import { canonicalMasterJSON, masterDigest } from './masterSnapshot'

export const assetMimeExtensions = { 'image/png': 'png','image/jpeg': 'jpg','image/gif': 'gif','image/webp': 'webp','image/avif': 'avif' } as const
export type AssetReference = { recordId: string; revision: number; digest: string }
export type AssetSnapshot = { format: 1; recordId: string; revision: number; tenantId: number; sourceUpdatedAt: string;
  alt: string; mimeType: keyof typeof assetMimeExtensions; size: number; sha256: string; width: number | null; height: number | null }
export type AssetRelease = AssetSnapshot & { digest: string; operationId: string; createdAt: string }
export type AssetWithdrawal = AssetReference & { operationId: string; withdrawnAt: string; reason: string }
export type AssetTransfer = { siteId: string; localSiteId: number; routingVersion: number; centralTenantId: number;
  release: AssetRelease; withdrawal: AssetWithdrawal | null; bytes: Uint8Array | null }
export const MAX_ASSET_BYTES = 5 * 1024 * 1024
export function assetReference(value: AssetRelease): AssetReference {
  return { recordId: value.recordId,revision: value.revision,digest: value.digest }
}
export function assertAssetReference(value: AssetReference): void {
  if (!value || Object.keys(value).sort().join(',') !== 'digest,recordId,revision' || typeof value.recordId !== 'string' ||
    !/^[1-9][0-9]*$/.test(value.recordId) || !Number.isSafeInteger(Number(value.recordId)) ||
    !Number.isSafeInteger(value.revision) || value.revision < 1 || typeof value.digest !== 'string' || !/^[0-9a-f]{64}$/.test(value.digest)) throw new Error('Invalid asset reference')
}
export function assetSnapshotJSON(value: AssetSnapshot): string {
  assertAssetReference({ recordId: value.recordId,revision: value.revision,digest: '0'.repeat(64) })
  if (value.format !== 1 || !Number.isSafeInteger(value.tenantId) || value.tenantId < 0 || new Date(value.sourceUpdatedAt).toISOString() !== value.sourceUpdatedAt ||
    typeof value.alt !== 'string' || !value.alt.trim() || value.alt.length > 4096 || !Object.hasOwn(assetMimeExtensions,value.mimeType) ||
    !Number.isSafeInteger(value.size) || value.size < 1 || value.size > MAX_ASSET_BYTES || !/^[0-9a-f]{64}$/.test(value.sha256) ||
    [value.width,value.height].some(n => n !== null && (!Number.isSafeInteger(n) || n < 1 || n > 100000))) throw new Error('Invalid asset snapshot')
  return canonicalMasterJSON({ format: 1,recordId: value.recordId,revision: value.revision,tenantId: value.tenantId,sourceUpdatedAt: value.sourceUpdatedAt,
    alt: value.alt,mimeType: value.mimeType,size: value.size,sha256: value.sha256,width: value.width,height: value.height })
}
export async function verifyAssetRelease(value: AssetRelease): Promise<AssetRelease> {
  const json = assetSnapshotJSON(value)
  if (typeof value.operationId !== 'string' || !value.operationId || value.operationId.length > 128 ||
    new Date(value.createdAt).toISOString() !== value.createdAt || await masterDigest(json) !== value.digest) throw new Error('Asset release integrity mismatch')
  return { ...JSON.parse(json),digest: value.digest,operationId: value.operationId,createdAt: value.createdAt }
}
export async function assetBytesDigest(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource)),b => b.toString(16).padStart(2,'0')).join('')
}
export async function verifyAssetBytes(release: AssetSnapshot, bytes: Uint8Array): Promise<void> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== release.size || bytes.byteLength > MAX_ASSET_BYTES ||
    await assetBytesDigest(bytes) !== release.sha256) throw new Error('Asset bytes do not match the immutable version')
  const ascii = (start: number,length: number) => String.fromCharCode(...bytes.slice(start,start+length))
  const signature = release.mimeType === 'image/png' ? bytes[0] === 137 && ascii(1,7) === 'PNG\r\n\x1a\n'
    : release.mimeType === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : release.mimeType === 'image/gif' ? ['GIF87a','GIF89a'].includes(ascii(0,6))
    : release.mimeType === 'image/webp' ? ascii(0,4) === 'RIFF' && ascii(8,4) === 'WEBP'
    : ascii(4,4) === 'ftyp' && ['avif','avis'].includes(ascii(8,4))
  if (!signature) throw new Error('Asset MIME signature mismatch')
}
export function assetFilename(value: AssetRelease): string {
  return `central-${value.recordId}-r${value.revision}-${value.digest}.${assetMimeExtensions[value.mimeType]}`
}
export function assetArchiveKey(value: AssetRelease): string { return `master-assets/${assetFilename(value)}` }
