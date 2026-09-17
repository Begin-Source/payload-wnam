import type { Access, AuthStrategy, CollectionConfig, SanitizedConfig, TypedUser } from 'payload'
import { requireLocalSiteId, requireSiteContext } from './context'
import { assertAdminHost } from '../site-control/registry'
import { SITE_SESSION_COOKIE, type SitePrincipal, type SiteRole } from '../site-control/sso'

export type IdentityProjection = Readonly<{ id: number; centralUserId: string; displayName: string }>
export type AuthenticatedSiteUser = IdentityProjection & {
  collection: 'users'; _strategy: 'central-site-session'; siteId: string; siteRole: SiteRole
}

export function siteSessionFromHeaders(headers: Headers): string | null {
  const values = (headers.get('cookie') ?? '').split(';').map(part => part.trim())
    .filter(part => part.startsWith(`${SITE_SESSION_COOKIE}=`)).map(part => part.slice(SITE_SESSION_COOKIE.length + 1))
  if (!values.length) return null
  if (values.length !== 1 || !/^[0-9a-f]{64}$/.test(values[0])) throw new Error('Invalid site session cookie')
  return values[0]
}

export function assertSiteWriteOrigin(method: string, headers: Headers, trustedAdminHost: string): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return
  if (headers.get('origin') !== `https://${trustedAdminHost}`) throw new Error('Cross-origin site write rejected')
}

export function centralSiteStrategy(options: {
  authenticateSession: (session: string, siteId: string, adminHost: string) => Promise<SitePrincipal>
  loadProjection: (principal: SitePrincipal) => Promise<IdentityProjection | null>
}): AuthStrategy {
  return {
    name: 'central-site-session',
    async authenticate({ headers }) {
      const session = siteSessionFromHeaders(headers)
      // Anonymous public reads do not depend on central availability.
      if (!session) return { user: null }
      const context = requireSiteContext()
      const host = context.requestHost ?? ''
      assertAdminHost(context.siteId, host)
      const principal = await options.authenticateSession(session, context.siteId, host)
      if (principal.siteId !== context.siteId || principal.routingVersion !== context.routingVersion ||
        principal.localSiteId !== requireLocalSiteId()) throw new Error('Identity routing mismatch')
      const projection = await options.loadProjection(principal)
      requireSiteContext()
      if (!projection || projection.centralUserId !== principal.userId || !Number.isSafeInteger(projection.id) || projection.id < 1) {
        throw new Error('Site identity projection missing or invalid')
      }
      // Explicit allowlist: never spread a stored user or central response into
      // req.user; roles are supplied live by the central grant on THIS request.
      const user: AuthenticatedSiteUser = { id: projection.id, centralUserId: principal.userId,
        displayName: principal.displayName, collection: 'users', _strategy: 'central-site-session',
        siteId: principal.siteId, siteRole: principal.role }
      // Existing generated Config still describes the legacy shared-db Users.
      return { user: user as unknown as TypedUser }
    },
  }
}

export function sitePermission(permission: 'read' | 'write' | 'publish' | 'manage'): Access {
  const roles: Record<typeof permission, readonly SiteRole[]> = {
    read: ['viewer','editor','publisher','manager'], write: ['editor','publisher','manager'],
    publish: ['publisher','manager'], manage: ['manager'],
  }
  return ({ req }) => {
    const user = authenticatedSiteUser(req.user)
    return user !== null && roles[permission].includes(user.siteRole)
  }
}

/** Recognize only our live strategy in its trusted admin context. Legacy roles
 * and tenant membership never grant permissions in an isolated site.
 */
export function authenticatedSiteUser(value: unknown): AuthenticatedSiteUser | null {
  if (!value || typeof value !== 'object') return null
  const user = value as AuthenticatedSiteUser
  if (user.collection !== 'users' || user._strategy !== 'central-site-session') return null
  const context = requireSiteContext()
  return user.siteId === context.siteId && context.requestHost === `cms-site-${context.siteId}.beginos.org` &&
    Number.isSafeInteger(user.id) && user.id > 0 && typeof user.centralUserId === 'string' &&
    /^[1-9][0-9]*$/.test(user.centralUserId) && Number.isSafeInteger(Number(user.centralUserId)) &&
    ['viewer','editor','publisher','manager'].includes(user.siteRole) ? user : null
}

/** Site-only identity relation target. Central provisioning/sync owns writes. */
export function siteIdentityCollection(strategy: AuthStrategy): CollectionConfig {
  return {
    slug: 'users', admin: { useAsTitle: 'displayName' }, timestamps: true,
    auth: { disableLocalStrategy: true, useSessions: false, useAPIKey: false, strategies: [strategy] },
    access: { read: sitePermission('read'), create: () => false, update: () => false, delete: () => false },
    hooks: { afterMe: [({ req }) => {
      // Payload's default /me reloads the persisted projection and drops the
      // live role/site fields. Return only this request's authenticated allowlist;
      // never persist grants or mint a local JWT to satisfy the admin provider.
      const user = authenticatedSiteUser(req.user)
      return { user, collection: 'users', strategy: user?._strategy }
    }] },
    fields: [
      { name: 'centralUserId', type: 'text', required: true, unique: true },
      { name: 'displayName', type: 'text', required: true },
    ],
  }
}

/** Run after plugins/sanitization; another auth collection must not re-enable JWT. */
export function assertSiteIdentityBoundary(config: SanitizedConfig): SanitizedConfig {
  if (config.admin.user !== 'users') throw new Error('Site admin identity collection mismatch')
  const forbidden = new Set(['password','salt','hash','resetPasswordToken','resetPasswordExpiration','sessions','apiKey','apiKeyIndex'])
  for (const collection of config.collections) {
    if (collection.auth && (collection.slug !== 'users' || !collection.auth.disableLocalStrategy || collection.auth.useAPIKey || collection.auth.useSessions)) {
      throw new Error('Site configuration must not enable local credentials or sessions')
    }
    if (collection.slug === 'users') {
      if (!collection.auth || collection.auth.strategies.length !== 1 || collection.auth.strategies[0].name !== 'central-site-session') {
        throw new Error('Site identity must use only the central session strategy')
      }
      for (const field of collection.flattenedFields) {
        if ('name' in field && forbidden.has(field.name)) throw new Error('Credential field in site identity projection')
      }
    }
  }
  return config
}
