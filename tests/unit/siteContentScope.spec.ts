// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { CollectionBeforeChangeHook, Payload, PayloadRequest } from 'payload'
import { requireLocalSiteId, withSiteContext, type SiteContext } from '../../src/site-runtime/context'
import { buildSitesVisibilityWhere, resolveVisibleSiteIds } from '../../src/utilities/siteVisibilityScope'
import { validateAuthorsSitesWithinVisibilityScope, validateOriginalEvidenceArticleVisibilityScope, validateSiteFieldWithinVisibilityScope } from '../../src/collections/hooks/validateSiteVisibilityScope'
import { articlePublishGate } from '../../src/collections/hooks/articlePublishGate'
import { writeVetoHotCacheEntry } from '../../src/collections/hooks/writeVetoHotCache'

const scope: SiteContext = { siteId: 'a', localSiteId: 37, binding: { prepare() { throw new Error('Unexpected SQL') } } as unknown as D1Database,
  routingVersion: 1, currentRoutingVersion: () => 1, identity: null, requestHost: 'cms-site-a.beginos.org' }
const principal = { id: 7, centralUserId: '19', collection: 'users', _strategy: 'central-site-session', siteId: 'a', siteRole: 'editor' }
function request(user: unknown = principal) {
  return { user, payload: { find: vi.fn(), findByID: vi.fn(async () => ({ id: 90, site: 37 })), create: vi.fn(async () => ({})) } } as unknown as PayloadRequest
}
function change(req: PayloadRequest, data: Record<string, unknown>, originalDoc?: Record<string, unknown>) {
  return { req, data, originalDoc, operation: originalDoc ? 'update' : 'create' } as Parameters<CollectionBeforeChangeHook>[0]
}

describe('preserved numeric site relationships under live site identity', () => {
  it('resolves only the registered local ID without querying teams or enumerating sites', async () => {
    for (const siteRole of ['viewer', 'editor', 'publisher', 'manager']) {
      const req = request({ ...principal, siteRole })
      await withSiteContext(scope, async () => {
        expect(await buildSitesVisibilityWhere(req)).toEqual({ id: { equals: 37 } })
        expect(await resolveVisibleSiteIds(req.payload, req)).toEqual([37])
        expect(req.payload.find).not.toHaveBeenCalled()
      })
    }
  })

  it('refuses other-site identities, legacy super-admins and public-host identities in mapped contexts', async () => {
    for (const user of [null, { ...principal, siteId: 'b', roles: ['super-admin'] },
      { ...principal, siteRole: 'invalid', roles: ['super-admin'] }, { id: 7, email: 'staff@example.invalid', collection: 'users', roles: ['super-admin'] }]) {
      const req = request(user)
      await withSiteContext(scope, async () => expect(await resolveVisibleSiteIds(req.payload, req)).toBe(false))
      expect(req.payload.find).not.toHaveBeenCalled()
    }
    const req = request()
    await withSiteContext({ ...scope, requestHost: 'public.example' }, async () => expect(await buildSitesVisibilityWhere(req)).toBe(false))
    await withSiteContext({ ...scope, localSiteId: undefined }, async () => {
      await expect(resolveVisibleSiteIds(req.payload, req)).rejects.toThrow('mapping required')
    })
    await expect(buildSitesVisibilityWhere(req)).rejects.toThrow('context required')
  })

  it('keeps the legacy shared-database visibility rules outside the mapped site runtime', async () => {
    const req = request({ id: 7, email: 'staff@example.invalid', collection: 'users', roles: ['super-admin'] })
    expect(await resolveVisibleSiteIds(req.payload, req)).toBe(true)
    const manager = request({ id: 7, email: 'staff@example.invalid', collection: 'users', roles: ['site-manager'] })
    expect(await buildSitesVisibilityWhere(manager)).toEqual({ or: [{ createdBy: { equals: 7 } }, { operators: { contains: 7 } }] })
  })

  it('validates relationship containment for both staff writes and trusted internal jobs', async () => {
    for (const user of [principal, null, { id: 7, email: 'staff@example.invalid', collection: 'users', roles: ['super-admin'] }]) {
      const req = request(user)
      await withSiteContext(scope, async () => {
        await expect(validateSiteFieldWithinVisibilityScope(change(req, { site: 37 }))).resolves.toEqual({ site: 37 })
        await expect(validateSiteFieldWithinVisibilityScope(change(req, { title: 'Edited' }, { site: { id: 37 } }))).resolves.toEqual({ title: 'Edited' })
        for (const site of [82, 'a', null, 37.5]) {
          await expect(validateSiteFieldWithinVisibilityScope(change(req, { site }, { site: 37 }))).rejects.toThrow()
        }
        await expect(validateAuthorsSitesWithinVisibilityScope(change(req, { sites: [37, { id: '37' }] }))).resolves.toBeDefined()
        for (const sites of [[82], [37, 82], [37, 'invalid'], []]) {
          await expect(validateAuthorsSitesWithinVisibilityScope(change(req, { sites }, { sites: [37] }))).rejects.toThrow()
        }
        await expect(validateOriginalEvidenceArticleVisibilityScope(change(req, { article: 90 }))).resolves.toEqual({ article: 90 })
        await expect(validateOriginalEvidenceArticleVisibilityScope(change(req, { article: null }, { article: 90 }))).rejects.toThrow()
        vi.mocked(req.payload.findByID).mockResolvedValueOnce({ id: 90, site: 82 } as never)
        await expect(validateOriginalEvidenceArticleVisibilityScope(change(req, { article: 90 }))).rejects.toThrow()
        expect(req.payload.find).not.toHaveBeenCalled()
      })
    }
  })

  it('rejects invalid or absent mappings instead of guessing site 1', () => {
    for (const localSiteId of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => withSiteContext({ ...scope, localSiteId }, () => {})).toThrow('mapping')
    }
    withSiteContext({ ...scope, localSiteId: undefined }, () => expect(requireLocalSiteId).toThrow('mapping required'))
  })

  it('retains numeric site attribution when a quality veto blocks publication', async () => {
    const req = request()
    for (const site of [37, '37', { id: 37 }, { id: '37' }]) {
      const result = await withSiteContext(scope, () => articlePublishGate(change(req, {
        site, title: 'Example', status: 'published', author: 7, _quality: { rawScore: 90, vetoes: ['T04'] },
      })))
      expect(result.status).toBe('draft')
      expect(req.payload.create).toHaveBeenLastCalledWith(expect.objectContaining({
        collection: 'knowledge-base', data: expect.objectContaining({ site: 37, severity: 'veto' }),
      }))
    }
    const payload = { create: vi.fn() } as unknown as Payload
    await withSiteContext(scope, async () => {
      for (const siteId of [82, 'a', 'bad', Number.MAX_SAFE_INTEGER + 1]) {
        await expect(writeVetoHotCacheEntry(payload, { siteId, subject: 'Example', vetoIds: ['T04'] })).rejects.toThrow('mapping mismatch')
      }
      expect(payload.create).not.toHaveBeenCalled()
      await writeVetoHotCacheEntry(payload, { subject: 'Example', vetoIds: ['T04'] })
      expect(payload.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ site: 37 }) }))
    })
  })
})
