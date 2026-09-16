// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { withSiteContext } from '../../src/site-runtime/context'
import { d1ClientFromPayload } from '../../src/utilities/d1NarrowUpdate'
import { consumePipelineNonce, createPipelineNonceStore } from '../../src/utilities/pipelineNonceStore'

const cloudflare = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: cloudflare.get }))

const database = () => ({ prepare: vi.fn(() => { throw new Error('Unexpected database access') }) }) as unknown as D1Database
const payload = (binding?: D1Database, site = false) => ({
  config: { custom: { siteDatabaseIsolation: site } }, db: { binding },
}) as unknown as Payload

afterEach(() => vi.resetAllMocks())

describe('raw SQL database resolution', () => {
  it('uses explicit legacy adapter bindings without global or environment fallback', () => {
    const a = database(), b = database()
    expect(d1ClientFromPayload(payload(a))).toBe(a)
    expect(d1ClientFromPayload(payload(a), b)).toBe(b)
    expect(d1ClientFromPayload(payload())).toBeNull()
    expect(cloudflare.get).not.toHaveBeenCalled()
  })

  it('keeps guarded site configs on the strict proxy without context, even with a raw override', () => {
    const wrong = database()
    expect(() => d1ClientFromPayload(payload(wrong, true), wrong)!.prepare('SELECT 1')).toThrow('context required')
    expect(wrong.prepare).not.toHaveBeenCalled()
  })

  it('rejects stale scope before consulting explicit or adapter clients', () => {
    const wrong = database()
    let version = 1
    withSiteContext({ siteId: 'a', binding: database(), routingVersion: 1, currentRoutingVersion: () => version, identity: null }, () => {
      version = 2
      expect(() => d1ClientFromPayload(payload(wrong), wrong)).toThrow('Stale')
    })
    expect(wrong.prepare).not.toHaveBeenCalled()
  })

  it('refuses a default nonce database in isolated runtime without scope', async () => {
    const wrong = database()
    cloudflare.get.mockResolvedValue({ env: { SITE_ISOLATION_P0: '1', D1: wrong } })
    await expect(consumePipelineNonce('nonce', 1000, 0)).rejects.toThrow('context required')
    expect(wrong.prepare).not.toHaveBeenCalled()
  })

  it('fails when the legacy nonce runtime is unavailable', async () => {
    cloudflare.get.mockRejectedValue(new Error('No runtime'))
    await expect(consumePipelineNonce('nonce', 1000, 0)).rejects.toThrow('No runtime')
    const explicit = createPipelineNonceStore(() => undefined as unknown as D1Database)
    await expect(explicit('nonce', 1000, 0)).rejects.toThrow('unavailable')
  })
})
