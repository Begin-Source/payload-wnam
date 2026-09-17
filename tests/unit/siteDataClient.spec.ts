// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'
import type { SiteDataRPC } from '../../src/site-control/dataDelivery'
import type { MasterReference } from '../../src/site-control/masterSnapshot'
import { siteDataClient } from '../../src/site-runtime/dataClient'
import { withSiteContext, type SiteContext } from '../../src/site-runtime/context'

const token = 'a'.repeat(64)
const context: SiteContext = { siteId: 'a',localSiteId: 37,binding: { prepare() {} } as unknown as D1Database,
  routingVersion: 1,currentRoutingVersion: () => 1,identity: null,requestHost: 'cms-site-a.beginos.org' }
const ref: MasterReference = { collection: 'authors',recordId: '1',revision: 1,digest: 'b'.repeat(64) }
const principal = { siteId: 'a',localSiteId: 37,routingVersion: 1,userId: '7',displayName: 'Manager',role: 'manager' as const }
const reply = { ok: true as const,principal,value: { siteId: 'a',localSiteId: 37,routingVersion: 1,centralTenantId: 1,root: ref,releases: [] } }
function request(role='manager',cookie=`__Host-site-session=${token}`) {
  return { headers: new Headers({ cookie }),user: { id: 1,centralUserId: '7',displayName: 'Manager',collection: 'users',
    _strategy: 'central-site-session',siteId: 'a',siteRole: role },payload: { config: { custom: { payloadRole: 'site' } } } } as unknown as PayloadRequest
}
function rpc() {
  return { readMaster: vi.fn(async () => reply),readConfig: vi.fn(),readAsset: vi.fn() }
}
describe('request-bound central data client',() => {
  it('derives credentials and scope from trusted request context, with no default or caller override',async () => {
    const service = rpc()
    await withSiteContext(context,async () => {
      const client = siteDataClient(request(),service)
      expect(await client.readBundle('a',1,ref)).toEqual(reply.value)
      expect(service.readMaster).toHaveBeenCalledWith({ session: token,siteId: 'a',adminHost: context.requestHost,routingVersion: 1 },ref)
      await expect(client.readBundle('b',1,ref)).rejects.toThrow('context mismatch')
      await expect(client.readBundle('a',2,ref)).rejects.toThrow('context mismatch')
      expect(service.readMaster).toHaveBeenCalledTimes(1)
    })
  })
  it('rejects missing or ambiguous session cookies and non-manager roles before transport',() => {
    const service = rpc()
    withSiteContext(context,() => {
      for (const req of [request('editor'),request('manager',''),request('manager',`__Host-site-session=${token}; __Host-site-session=${token}`)]) {
        expect(() => siteDataClient(req,service)).toThrow()
      }
    })
    expect(service.readMaster).not.toHaveBeenCalled()
  })
  it('rejects capability reuse across requests even for the same site',async () => {
    const service = rpc(),req = request()
    const client = withSiteContext(context,() => siteDataClient(req,service))
    await withSiteContext(context,async () => {
      await expect(client.readBundle('a',1,ref)).rejects.toThrow('context mismatch')
      expect(() => siteDataClient(req,service)).toThrow('Cross-context')
    })
    expect(service.readMaster).not.toHaveBeenCalled()
  })
  it('rejects forged principal fields and sanitizes failed RPC responses',async () => {
    for (const changed of [{ ...principal,userId: '8' },{ ...principal,siteId: 'b' },{ ...principal,localSiteId: 999 },
      { ...principal,routingVersion: 2 },{ ...principal,role: 'viewer' }]) {
      await withSiteContext(context,async () => {
        const service = { ...rpc(),readMaster: async () => ({ ...reply,principal: changed }) } as SiteDataRPC
        await expect(siteDataClient(request(),service).readBundle('a',1,ref)).rejects.toThrow('identity mismatch')
      })
    }
    for (const result of [null,{ ok: false,reason: 'unavailable' },{ ok: false,reason: 'denied' }]) await withSiteContext(context,async () => {
      const service = { ...rpc(),readMaster: async () => result } as unknown as SiteDataRPC
      await expect(siteDataClient(request(),service).readBundle('a',1,ref)).rejects.toThrow(/Invalid|unavailable|denied/)
    })
    await withSiteContext(context,async () => {
      const service = { ...rpc(),readMaster: async () => { throw new Error('PRIVATE SQL TOKEN') } }
      await expect(siteDataClient(request(),service).readBundle('a',1,ref)).rejects.toThrow('Central data service unavailable')
    })
  })
  it('revalidates routing after the asynchronous response',async () => {
    let version = 1
    await withSiteContext({ ...context,currentRoutingVersion: () => version },async () => {
      const service = { ...rpc(),readMaster: async () => { version = 2; return reply } }
      await expect(siteDataClient(request(),service).readBundle('a',1,ref)).rejects.toThrow('Stale site routing')
    })
  })
})
