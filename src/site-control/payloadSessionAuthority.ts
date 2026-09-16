import type { LiveCentralSession } from './sso'

/** Payload 3.82.1 central Users session authority. This reads only central D1;
 * no password hashes, reset tokens or session rows are projected to site D1.
 * Logout/session deletion and account locking take effect on the next request.
 */
export function payloadSessionAuthority(database: D1Database, now = Date.now): LiveCentralSession {
  return async (userId, sessionId) => {
    if (!/^[1-9][0-9]*$/.test(userId) || !Number.isSafeInteger(Number(userId)) || !sessionId || sessionId.length > 128) return null
    const row = await database.prepare(`SELECT u.id, u.email, u.lock_until AS lockUntil, s.expires_at AS expiresAt
      FROM users_sessions s JOIN users u ON u.id = s._parent_id WHERE s.id = ? AND u.id = ?`)
      .bind(sessionId, Number(userId)).first<{ id: number; email: string; lockUntil: string | null; expiresAt: string }>()
    if (!row) return null
    const expiresAt = Date.parse(row.expiresAt)
    if (!Number.isFinite(expiresAt) || expiresAt <= now() ||
      (row.lockUntil !== null && (!Number.isFinite(Date.parse(row.lockUntil)) || Date.parse(row.lockUntil) > now()))) return null
    return Object.freeze({ userId: String(row.id), sessionId, displayName: row.email, expiresAt })
  }
}
