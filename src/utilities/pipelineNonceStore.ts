import { getCloudflareContext } from '@opennextjs/cloudflare'
import { optionalSiteContext } from '../site-runtime/context'
import { createSiteD1Proxy } from '../site-runtime/d1'

export type PipelineNonceStore = (nonceHash: string, expiresAt: number, now: number) => Promise<boolean>
const siteDatabase = createSiteD1Proxy()

/** Explicit resolver for CLI/tests; site requests always use their scoped database. */
export function createPipelineNonceStore(resolveDatabase: () => D1Database | Promise<D1Database>): PipelineNonceStore {
  return async (nonceHash, expiresAt, now) => {
    const db = optionalSiteContext() ? siteDatabase : await resolveDatabase()
    if (!db || typeof db.prepare !== 'function') throw new Error('Pipeline nonce store unavailable')
    await db.prepare('DELETE FROM pipeline_auth_nonces WHERE nonce_hash IN (SELECT nonce_hash FROM pipeline_auth_nonces WHERE expires_at <= ? LIMIT 100)')
      .bind(new Date(now).toISOString()).run()
    const result = await db.prepare('INSERT INTO pipeline_auth_nonces (nonce_hash, expires_at) VALUES (?, ?) ON CONFLICT(nonce_hash) DO NOTHING')
      .bind(nonceHash, new Date(expiresAt).toISOString()).run()
    if (!result.success || typeof result.meta.changes !== 'number') throw new Error('Pipeline nonce store unavailable')
    return result.meta.changes === 1
  }
}

export const consumePipelineNonce = createPipelineNonceStore(async () => {
  const { env } = await getCloudflareContext({ async: true })
  // Missing site scope must fail even if a legacy D1 binding is accidentally present.
  if ((env as { SITE_ISOLATION_P0?: string }).SITE_ISOLATION_P0 === '1') return siteDatabase
  return env.D1
})
