// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { bindSiteCallback, requireSiteContext, withSiteContext, type SiteContext } from '../../src/site-runtime/context'
import { createSiteD1Proxy } from '../../src/site-runtime/d1'

function site(siteId: string): SiteContext {
  const prepare = vi.fn((sql: string) => {
    const statement = {
      bind: vi.fn(() => statement),
      first: vi.fn(async () => ({ id: 1, siteId, sql })),
      all: vi.fn(async () => ({ results: [{ id: 1, siteId }] })),
      run: vi.fn(async () => ({ success: true })),
      raw: vi.fn(async () => [[siteId]]),
    }
    return statement
  })
  return {
    siteId, binding: { prepare, batch: vi.fn(async (items: D1PreparedStatement[]) => Promise.all(items.map((s: D1PreparedStatement) => s.first()))), exec: vi.fn(), dump: vi.fn() } as unknown as D1Database,
    routingVersion: 1, currentRoutingVersion: () => 1, identity: { userId: 'staff', sessionId: 'session' },
  }
}

describe('request-scoped D1 adapter client', () => {
  it('interleaves identical IDs across two databases without changing adapter instances', async () => {
    const db = createSiteD1Proxy()
    const a = site('a'), b = site('b')
    await Promise.all(Array.from({ length: 100 }, (_, i) => {
      const context = i % 2 ? a : b
      return withSiteContext(context, async () => {
        const query = db.prepare('SELECT * FROM articles WHERE id = ?').bind(1)
        await new Promise(resolve => setTimeout(resolve, i % 4))
        const row = await query.first<{ siteId: string }>()
        expect(row?.siteId).toBe(context.siteId)
        expect((await db.batch([query]))[0]).toMatchObject({ siteId: context.siteId })
      })
    }))
  })

  it('fails closed without context for every database entry point', () => {
    const db = createSiteD1Proxy()
    for (const operation of [() => db.prepare('SELECT 1'), () => db.batch([]), () => db.exec('SELECT 1'), () => db.dump()]) {
      expect(operation).toThrow('context required')
    }
    expect(() => db.withSession()).toThrow('disabled')
  })

  it('rejects statement escape, foreign batches and cross-request same-site reuse', () => {
    const db = createSiteD1Proxy(), a = site('a'), b = site('b')
    const statement = withSiteContext(a, () => db.prepare('SELECT 1'))
    expect(() => statement.run()).toThrow('context required')
    for (const context of [a, b]) withSiteContext(context, () => {
      for (const operation of [() => statement.bind(1), () => statement.first(), () => statement.run(), () => statement.raw(), () => statement.all(), () => db.batch([statement])]) {
        expect(operation).toThrow('Cross-context')
      }
      expect(() => db.batch([context.binding.prepare('SELECT 1')])).toThrow('Unscoped')
    })
  })

  it('rejects stale routing at entry and after async waits', async () => {
    const db = createSiteD1Proxy(), a = site('a')
    let version = 1
    const context = { ...a, currentRoutingVersion: () => version }
    await withSiteContext(context, async () => {
      const statement = db.prepare('SELECT 1')
      await Promise.resolve()
      version++
      expect(() => statement.first()).toThrow('Stale')
      expect(() => db.batch([statement])).toThrow('Stale')
    })
    expect(() => withSiteContext(context, () => null)).toThrow('Stale')
  })

  it('snapshots identity, restores nested scope and binds deferred stream callbacks', async () => {
    const a = site('a'), b = site('b'), db = createSiteD1Proxy()
    const callback = withSiteContext(a, () => {
      expect(Object.isFrozen(requireSiteContext())).toBe(true)
      expect(Object.isFrozen(requireSiteContext().identity)).toBe(true)
      withSiteContext(b, () => expect(requireSiteContext().siteId).toBe('b'))
      expect(requireSiteContext().siteId).toBe('a')
      return bindSiteCallback(async () => db.prepare('SELECT 1').first<{ siteId: string }>())
    })
    expect((await withSiteContext(b, callback))?.siteId).toBe('a')
    expect(() => requireSiteContext()).toThrow('context required')
  })
})
