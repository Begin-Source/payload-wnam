import { describe, expect, it, vi } from 'vitest'
import { centralFetch } from '../../src/application-roles/centralIngress'
import { requireCentralEnvironment, type CentralEnvironment } from '../../src/application-roles/centralEnvironment'

const env = (): CentralEnvironment => ({ CENTRAL_D1: { prepare: vi.fn() } as unknown as D1Database,
  CENTRAL_MEDIA: { get: vi.fn(),put: vi.fn() } as unknown as R2Bucket,
  MASTER_ASSET_ARCHIVE: { get: vi.fn() } as unknown as R2Bucket,PAYLOAD_SECRET: 'test-central-secret-with-32-characters' })
const ctx = {} as ExecutionContext

describe('independent central ingress',() => {
  it('rejects legacy-only bindings, missing secrets and shared archive storage',() => {
    expect(() => requireCentralEnvironment({ D1: {},R2: {},PAYLOAD_SECRET: 'legacy' })).toThrow()
    expect(() => requireCentralEnvironment({ ...env(),PAYLOAD_SECRET: '' })).toThrow()
    const bindings = env()
    expect(() => requireCentralEnvironment({ ...bindings,MASTER_ASSET_ARCHIVE: bindings.CENTRAL_MEDIA })).toThrow()
  })
  it('uses the canonical URL and denies forged forwarded origins before application access',async () => {
    const next = vi.fn()
    expect((await centralFetch(new Request('https://evil.example/admin',{ headers: { 'x-forwarded-host': 'hub.beginos.org' } }),env(),ctx,next)).status).toBe(421)
    expect((await centralFetch(new Request('http://hub.beginos.org/admin'),env(),ctx,next)).status).toBe(421)
    expect(next).not.toHaveBeenCalled()
  })
  it('normalizes origin headers and preserves private streaming responses and cookies',async () => {
    const bindings = env()
    const next = vi.fn(async (request: Request) => {
      expect(request.headers.get('x-forwarded-host')).toBe('hub.beginos.org')
      expect(request.headers.get('forwarded')).toBeNull()
      expect(request.headers.get('x-site-id')).toBeNull()
      return new Response('central stream',{ headers: { 'set-cookie': 'test=1; Secure; HttpOnly','cache-control': 'public, max-age=300' } })
    })
    const result = await centralFetch(new Request('https://hub.beginos.org/admin',{ headers: { 'x-forwarded-host': 'foreign.example',forwarded: 'host=foreign.example','x-site-id': 'b' } }),bindings,ctx,next)
    expect(await result.text()).toBe('central stream')
    expect(result.headers.get('cache-control')).toBe('private, no-store')
    expect(result.headers.get('set-cookie')).toContain('test=1')
    expect(next).toHaveBeenCalledOnce()
    expect(bindings.CENTRAL_D1.prepare).not.toHaveBeenCalled()
  })
  it('fails missing runtime capabilities closed without entering Next',async () => {
    const next = vi.fn()
    expect((await centralFetch(new Request('https://hub.beginos.org/admin'),{ ...env(),PAYLOAD_SECRET: '' },ctx,next)).status).toBe(503)
    expect(next).not.toHaveBeenCalled()
  })
})
