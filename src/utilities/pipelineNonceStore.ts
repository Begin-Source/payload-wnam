import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getCloudflareD1Binding } from './cloudflareD1Binding'

export type PipelineNonceStore = (nonceHash: string, expiresAt: number, now: number) => Promise<boolean>

export const consumePipelineNonce: PipelineNonceStore = async (nonceHash, expiresAt, now) => {
  const binding = getCloudflareD1Binding() ?? (await getCloudflareContext({ async: true })).env.D1
  const db = binding as D1Database
  if (!db || typeof db.prepare !== 'function') throw new Error('Pipeline nonce store unavailable')
  await db.prepare('DELETE FROM pipeline_auth_nonces WHERE nonce_hash IN (SELECT nonce_hash FROM pipeline_auth_nonces WHERE expires_at <= ? LIMIT 100)')
    .bind(new Date(now).toISOString()).run()
  const result = await db.prepare('INSERT INTO pipeline_auth_nonces (nonce_hash, expires_at) VALUES (?, ?) ON CONFLICT(nonce_hash) DO NOTHING')
    .bind(nonceHash, new Date(expiresAt).toISOString()).run()
  if (result.success === false || typeof result.meta.changes !== 'number') throw new Error('Pipeline nonce store unavailable')
  return result.meta.changes === 1
}
