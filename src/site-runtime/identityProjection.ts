import type { SitePrincipal } from '../site-control/sso'
import { requireLocalSiteId, requireSiteContext } from './context'
import { createSiteD1Proxy } from './d1'
import type { IdentityProjection } from './siteIdentity'

const database = createSiteD1Proxy()
const columns = 'id, central_user_id AS centralUserId, display_name AS displayName'

/** Called only with a freshly authenticated central principal. Browser CRUD on
 * this collection stays disabled; roles/session credentials are never stored.
 * Existing local IDs survive refreshes so author/audit relations remain valid.
 */
export async function syncSiteIdentityProjection(principal: SitePrincipal): Promise<IdentityProjection> {
  const context = requireSiteContext()
  if (principal.siteId !== context.siteId || principal.routingVersion !== context.routingVersion ||
    principal.localSiteId !== requireLocalSiteId() ||
    typeof principal.userId !== 'string' || !/^[1-9][0-9]*$/.test(principal.userId) || !Number.isSafeInteger(Number(principal.userId)) ||
    typeof principal.displayName !== 'string' || !principal.displayName || principal.displayName.length > 320) {
    throw new Error('Invalid central identity projection')
  }
  const existing = await database.prepare(`SELECT ${columns} FROM users WHERE central_user_id = ?`)
    .bind(principal.userId).first<IdentityProjection>()
  requireSiteContext()
  if (existing && (!Number.isSafeInteger(existing.id) || existing.id < 1)) throw new Error('Invalid local identity ID')
  if (existing?.displayName === principal.displayName) return Object.freeze({
    id: existing.id, centralUserId: existing.centralUserId, displayName: existing.displayName,
  })
  const now = new Date().toISOString()
  const row = await database.prepare(`INSERT INTO users (central_user_id,display_name,created_at,updated_at) VALUES (?,?,?,?)
    ON CONFLICT(central_user_id) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at
    RETURNING ${columns}`).bind(principal.userId, principal.displayName, now, now).first<IdentityProjection>()
  requireSiteContext()
  if (!row || !Number.isSafeInteger(row.id) || row.id < 1) throw new Error('Identity projection write failed')
  return Object.freeze({ id: row.id, centralUserId: row.centralUserId, displayName: row.displayName })
}
