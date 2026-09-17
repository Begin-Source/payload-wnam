export type CentralEnvironment = {
  CENTRAL_D1: D1Database
  CENTRAL_MEDIA: R2Bucket
  MASTER_ASSET_ARCHIVE: R2Bucket
  PAYLOAD_SECRET: string
}

/** Runtime has no default D1, process-secret or legacy storage fallback. */
export function requireCentralEnvironment(value: unknown): CentralEnvironment {
  const env = value as Partial<CentralEnvironment> | undefined
  if (!env || typeof env.CENTRAL_D1?.prepare !== 'function' ||
    typeof env.CENTRAL_MEDIA?.get !== 'function' || typeof env.CENTRAL_MEDIA?.put !== 'function' ||
    typeof env.MASTER_ASSET_ARCHIVE?.get !== 'function' || env.CENTRAL_MEDIA === env.MASTER_ASSET_ARCHIVE ||
    typeof env.PAYLOAD_SECRET !== 'string' || env.PAYLOAD_SECRET.length < 32) {
    throw new Error('Central role bindings unavailable')
  }
  return env as CentralEnvironment
}
