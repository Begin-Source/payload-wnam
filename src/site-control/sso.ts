import { assertAdminHost, readSiteRegistration } from './registry'

export class SiteAccessDeniedError extends Error {}

export type SiteRole = 'viewer' | 'editor' | 'publisher' | 'manager'
export type CentralSession = Readonly<{ userId: string; sessionId: string; displayName: string; expiresAt: number }>
export type LiveCentralSession = (userId: string, sessionId: string) => Promise<CentralSession | null>
export type SitePrincipal = Readonly<{ siteId: string; userId: string; displayName: string; role: SiteRole; routingVersion: number }>
type StoredLogin = { siteId: string; userId: string; centralSessionId: string; adminHost: string; routingVersion: number; expiresAt: number }
const loginColumns = 'site_id AS siteId, user_id AS userId, central_session_id AS centralSessionId, admin_host AS adminHost, routing_version AS routingVersion, expires_at AS expiresAt'
export const SITE_SESSION_COOKIE = '__Host-site-session'
const encodeHex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
const randomToken = () => encodeHex(crypto.getRandomValues(new Uint8Array(32)))
async function hashToken(token: string): Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new SiteAccessDeniedError('Invalid site login token')
  return encodeHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))
}

/** Central-only broker. The authority resolves the ORIGINAL live central session;
 * never a site projection, copied password, self-reported identity or cached grant.
 * Callers obtain issueTicket's identity from authenticated central request context.
 */
export class SiteLoginBroker {
  constructor(private readonly database: D1Database, private readonly authority: LiveCentralSession, private readonly now = Date.now) {}

  private async authorize(siteId: string, userId: string, sessionId: string) {
    const site = await readSiteRegistration(this.database, siteId)
    const identity = await this.authority(userId, sessionId)
    if (!site || site.migrationState !== 'active' || !identity || identity.userId !== userId ||
      identity.sessionId !== sessionId || !Number.isFinite(identity.expiresAt) || identity.expiresAt <= this.now()) throw new SiteAccessDeniedError('Site access denied')
    const grant = await this.database.prepare('SELECT role FROM site_runtime_access WHERE site_id = ? AND user_id = ?')
      .bind(siteId, userId).first<{ role: SiteRole }>()
    if (!grant || !['viewer','editor','publisher','manager'].includes(grant.role)) throw new SiteAccessDeniedError('Site access denied')
    return { site, identity, role: grant.role }
  }

  async issueTicket(siteId: string, identity: { userId: string; sessionId: string }) {
    const live = await this.authorize(siteId, identity.userId, identity.sessionId)
    const ticket = randomToken()
    const expiresAt = Math.min(this.now() + 60_000, live.identity.expiresAt)
    await this.database.prepare(`INSERT INTO site_login_tickets
      (token_hash,site_id,user_id,central_session_id,admin_host,routing_version,expires_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(await hashToken(ticket), siteId, identity.userId, identity.sessionId, live.site.adminHost, live.site.routingVersion, expiresAt).run()
    return { ticket, expiresAt, adminOrigin: `https://${live.site.adminHost}` }
  }

  /** trustedSiteId/host come from the server's trusted ingress, never forwarded headers. */
  async redeemTicket(ticket: string, trustedSiteId: string, adminHost: string) {
    assertAdminHost(trustedSiteId, adminHost)
    const ticketHash = await hashToken(ticket)
    const row = await this.database.prepare(`SELECT ${loginColumns} FROM site_login_tickets WHERE token_hash = ? AND consumed_by IS NULL`)
      .bind(ticketHash).first<StoredLogin>()
    if (!row || row.siteId !== trustedSiteId || row.adminHost !== adminHost || row.expiresAt <= this.now()) throw new SiteAccessDeniedError('Ticket invalid or expired')
    const live = await this.authorize(row.siteId, row.userId, row.centralSessionId)
    if (live.site.routingVersion !== row.routingVersion) throw new SiteAccessDeniedError('Ticket routing changed')
    const session = randomToken()
    const sessionHash = await hashToken(session)
    const expiresAt = Math.min(this.now() + 8 * 60 * 60_000, live.identity.expiresAt)
    const now = this.now()
    // The random session digest is also the atomic claim owner. A losing batch
    // cannot insert a session using another request's consumed ticket.
    const results = await this.database.batch([
      this.database.prepare(`UPDATE site_login_tickets SET consumed_by = ? WHERE token_hash = ? AND consumed_by IS NULL AND expires_at > ?
        AND EXISTS (SELECT 1 FROM site_runtime_registry r WHERE r.site_id = site_login_tickets.site_id AND r.routing_version = site_login_tickets.routing_version AND r.migration_state = 'active')
        AND EXISTS (SELECT 1 FROM site_runtime_access a WHERE a.site_id = site_login_tickets.site_id AND a.user_id = site_login_tickets.user_id)`)
        .bind(sessionHash, ticketHash, now),
      this.database.prepare(`INSERT INTO site_login_sessions (token_hash,site_id,user_id,central_session_id,admin_host,routing_version,expires_at)
        SELECT ?,site_id,user_id,central_session_id,admin_host,routing_version,? FROM site_login_tickets WHERE token_hash = ? AND consumed_by = ? AND expires_at > ?`)
        .bind(sessionHash, expiresAt, ticketHash, sessionHash, now),
    ])
    if (results[1].meta.changes !== 1) throw new SiteAccessDeniedError('Ticket already redeemed or access revoked')
    return { session, expiresAt, cookie: `${SITE_SESSION_COOKIE}=${session}; Path=/; Max-Age=${Math.max(0, Math.floor((expiresAt - now) / 1000))}; Secure; HttpOnly; SameSite=Strict` }
  }

  async authenticate(session: string, trustedSiteId: string, adminHost: string): Promise<SitePrincipal> {
    assertAdminHost(trustedSiteId, adminHost)
    const row = await this.database.prepare(`SELECT ${loginColumns} FROM site_login_sessions WHERE token_hash = ?`)
      .bind(await hashToken(session)).first<StoredLogin>()
    if (!row || row.siteId !== trustedSiteId || row.adminHost !== adminHost || row.expiresAt <= this.now()) throw new SiteAccessDeniedError('Site session invalid or expired')
    const live = await this.authorize(row.siteId, row.userId, row.centralSessionId)
    if (live.site.routingVersion !== row.routingVersion) throw new SiteAccessDeniedError('Site session routing changed')
    return Object.freeze({ siteId: row.siteId, userId: live.identity.userId, displayName: live.identity.displayName, role: live.role, routingVersion: row.routingVersion })
  }

  /** Logout remains effective after a grant has been revoked or a route paused. */
  async revokeSiteSession(session: string, trustedSiteId: string, adminHost: string): Promise<void> {
    assertAdminHost(trustedSiteId, adminHost)
    await this.database.prepare('DELETE FROM site_login_sessions WHERE token_hash = ? AND site_id = ? AND admin_host = ?')
      .bind(await hashToken(session), trustedSiteId, adminHost).run()
  }

  async revokeSession(session: string): Promise<void> {
    await this.database.prepare('DELETE FROM site_login_sessions WHERE token_hash = ?').bind(await hashToken(session)).run()
  }
}
