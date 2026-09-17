// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildConfig, getPayload, type Payload, type PayloadRequest } from 'payload'
import { sqliteD1Adapter } from '@payloadcms/db-d1-sqlite'
import { createSiteD1Proxy } from '../../src/site-runtime/d1'
import { withSiteContext, type SiteContext } from '../../src/site-runtime/context'
import { assertSiteIdentityBoundary, assertSiteWriteOrigin, centralSiteStrategy, siteIdentityCollection, sitePermission, siteSessionFromHeaders } from '../../src/site-runtime/siteIdentity'
import type { SitePrincipal } from '../../src/site-control/sso'

const token = 'a'.repeat(64)
const headers = new Headers({ cookie: `__Host-site-session=${token}` })
const context: SiteContext = { siteId: 'a', localSiteId: 37, binding: { prepare() { throw new Error('Unexpected database read') } } as unknown as D1Database,
  routingVersion: 1, currentRoutingVersion: () => 1, identity: null, requestHost: 'cms-site-a.beginos.org' }
const principal: SitePrincipal = { siteId: 'a', localSiteId: 37, userId: '7', displayName: 'Staff', role: 'editor', routingVersion: 1 }
const authenticateSession = vi.fn(async () => principal)
const loadProjection = vi.fn(async () => ({ id: 7, centralUserId: '7', displayName: 'Old name', hash: 'must-never-escape', roles: ['super-admin'] }))
const strategy = centralSiteStrategy({ authenticateSession, loadProjection })
let payload: Payload

describe('site Payload uses central authentication and credential-free identity projections', () => {
  beforeAll(async () => {
    const config = await buildConfig({
      secret: 'isolated-site-config-test', telemetry: false, typescript: { autoGenerate: false },
      admin: { user: 'users', disable: true, importMap: { autoGenerate: false } },
      collections: [siteIdentityCollection(strategy)],
      db: sqliteD1Adapter({ binding: createSiteD1Proxy(), push: false }),
    })
    assertSiteIdentityBoundary(config)
    payload = await getPayload({ config, key: 'site-central-identity-test' })
  })

  it('registers only the custom strategy and never falls back to local JWT or passwords', async () => {
    expect(payload.authStrategies.map(entry => entry.name)).toEqual(['central-site-session'])
    const authFields = payload.collections.users.config.flattenedFields.map(field => field.name)
    for (const name of ['hash', 'salt', 'password', 'sessions', 'resetPasswordToken', 'apiKey']) expect(authFields).not.toContain(name)
    authenticateSession.mockClear()
    expect((await payload.auth({ headers: new Headers({ cookie: 'payload-token=forged' }) })).user).toBeNull()
    expect(authenticateSession).not.toHaveBeenCalled()
  })

  it('returns only the live permission and safe identity fields through the real Payload auth API', async () => {
    const { user } = await withSiteContext(context, () => payload.auth({ headers }))
    expect(user).toMatchObject({ id: 7, centralUserId: '7', displayName: 'Staff', siteId: 'a', siteRole: 'editor', _strategy: 'central-site-session' })
    expect(user).not.toHaveProperty('hash')
    expect(user).not.toHaveProperty('roles')
    await withSiteContext(context, async () => {
      const req = { user } as PayloadRequest
      expect(await sitePermission('write')({ req })).toBe(true)
      expect(await sitePermission('manage')({ req })).toBe(false)
      expect(await sitePermission('publish')({ req })).toBe(false)
    })
    await withSiteContext({ ...context, siteId: 'b' }, async () => {
      expect(await sitePermission('read')({ req: { user } as PayloadRequest })).toBe(false)
    })
  })

  it('rejects public-host credentials, central outages and mismatched projections without fallback', async () => {
    const args = { headers, payload }
    await expect(withSiteContext({ ...context, requestHost: 'www.example.com' }, () => strategy.authenticate(args))).rejects.toThrow('admin host')
    const down = centralSiteStrategy({ authenticateSession: async () => { throw new Error('Central unavailable') }, loadProjection })
    await expect(withSiteContext(context, () => down.authenticate(args))).rejects.toThrow('Central unavailable')
    const mismatch = centralSiteStrategy({ authenticateSession, loadProjection: async () => ({ id: 8, centralUserId: '8', displayName: 'Wrong' }) })
    await expect(withSiteContext(context, () => mismatch.authenticate(args))).rejects.toThrow('projection')
    loadProjection.mockClear()
    await expect(withSiteContext({ ...context, localSiteId: 82 }, () => strategy.authenticate(args))).rejects.toThrow('routing mismatch')
    await expect(withSiteContext({ ...context, localSiteId: undefined }, () => strategy.authenticate(args))).rejects.toThrow('mapping required')
    expect(loadProjection).not.toHaveBeenCalled()
  })

  it('keeps the admin me response tied to the live strategy instead of stored grants', async () => {
    await withSiteContext(context, async () => {
      const { user } = await payload.auth({ headers })
      const hook = payload.collections.users.config.hooks.afterMe[0]
      const response = await hook({ collection: payload.collections.users.config, context: {}, req: { user } as PayloadRequest,
        response: { user: { id: 7, displayName: 'Stored name', roles: ['super-admin'] } as never } })
      expect(response?.user).toMatchObject({ siteId: 'a', siteRole: 'editor', displayName: 'Staff' })
      expect(response?.user).not.toHaveProperty('roles')
      expect(response).not.toHaveProperty('token')
    })
  })

  it('rejects duplicate cookies and cross-origin writes including sibling subdomains', () => {
    expect(() => siteSessionFromHeaders(new Headers({ cookie: `__Host-site-session=${token}; __Host-site-session=${token}` }))).toThrow()
    expect(() => assertSiteWriteOrigin('POST', new Headers({ origin: 'https://cms-site-b.beginos.org' }), context.requestHost!)).toThrow()
    expect(() => assertSiteWriteOrigin('POST', new Headers(), context.requestHost!)).toThrow()
    expect(() => assertSiteWriteOrigin('POST', new Headers({ origin: `https://${context.requestHost}` }), context.requestHost!)).not.toThrow()
  })
})
