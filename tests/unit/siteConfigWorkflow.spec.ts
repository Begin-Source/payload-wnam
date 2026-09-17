// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'
import { siteWorkflowTasks } from '../../src/site-runtime/configWorkflow'
import { withSiteContext, type SiteContext } from '../../src/site-runtime/context'

const scope: SiteContext = { siteId: 'a', localSiteId: 37, binding: { prepare() {} } as unknown as D1Database,
  routingVersion: 1, currentRoutingVersion: () => 1, identity: null, requestHost: 'cms-site-a.beginos.org' }
const external = vi.fn(async (_task: string, _args: unknown) => ({ state: 'succeeded' as const, output: { ok: true } }))
const tasks = siteWorkflowTasks(external)
const user = (role: string) => ({ id: 1, centralUserId: '7', collection: 'users', _strategy: 'central-site-session', siteId: 'a', siteRole: role })
function request(role: string | null = 'editor') {
  return { user: role ? user(role) : null, payload: { create: vi.fn(async () => ({ id: 5 })), update: vi.fn(async () => ({ id: 5 })),
    find: vi.fn(async () => ({ docs: [{ id: 5 }], totalDocs: 1 })), findByID: vi.fn(async () => ({ id: 5 })),
    delete: vi.fn(async () => ({ id: 5 })) } } as unknown as PayloadRequest
}
const run = (slug: string, req: PayloadRequest, input: unknown) => {
  const handler = tasks.find(task => task.slug === slug)!.handler
  if (typeof handler !== 'function') throw new Error('Inline handler expected')
  return handler({ req, input } as never)
}

describe('site generic automation task capability boundary', () => {
  it('forces Local API collection and field access for all four document task types', async () => {
    const req = request()
    await withSiteContext(scope, async () => {
      for (const [slug, method] of [['create-document','create'],['update-document','update'],['delete-document','delete'],['read-document','findByID']] as const) {
        expect((await run(slug, req, { collectionSlug: 'articles', id: 5, data: { title: 'Example' }, overrideAccess: true })).state).toBe('succeeded')
        const call = vi.mocked(req.payload[method]).mock.calls[0][0]
        expect(call.overrideAccess).toBe(false)
        expect(call.req!.user).toBe(req.user)
        expect(call.req).not.toBe(req)
      }
      expect((await run('read-document', req, { collectionSlug: 'articles', where: {} })).state).toBe('succeeded')
      expect(req.payload.find).toHaveBeenCalledWith(expect.objectContaining({ overrideAccess: false }))
    })
  })

  it('blocks identity, control, audit and job-state targets before invoking Payload', async () => {
    const req = request('manager')
    await withSiteContext(scope, async () => {
      for (const collectionSlug of ['users','sites','tenants','site-quotas','payload-jobs','workflow-jobs','audit-logs','commissions']) {
        await expect(run('create-document', req, { collectionSlug, data: {} })).rejects.toThrow('target denied')
      }
      expect(req.payload.create).not.toHaveBeenCalled()
    })
  })

  it('requires live site roles, including for background requests and external capabilities', async () => {
    external.mockClear()
    await withSiteContext(scope, async () => {
      for (const role of [null, 'viewer']) await expect(run('create-document', request(role), { collectionSlug: 'articles', data: {} })).rejects.toThrow('permission denied')
      for (const role of [null, 'viewer', 'editor', 'publisher']) await expect(run('http-request-step', request(role), {})).rejects.toThrow('permission denied')
      expect(external).not.toHaveBeenCalled()
      expect((await run('http-request-step', request('manager'), { url: 'https://example.invalid' })).state).toBe('succeeded')
      expect(external).toHaveBeenCalledOnce()
      expect(external.mock.calls[0][0]).toBe('http-request-step')
    })
    await expect(run('read-document', request('viewer'), { collectionSlug: 'articles' })).rejects.toThrow('context required')
    await withSiteContext({ ...scope, siteId: 'b', localSiteId: 82, requestHost: 'cms-site-b.beginos.org' }, async () => {
      await expect(run('read-document', request('viewer'), { collectionSlug: 'articles' })).rejects.toThrow('permission denied')
    })
  })
})
