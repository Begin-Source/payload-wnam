// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { withSiteContext, type SiteContext } from '../../src/site-runtime/context'
import { createSiteR2Proxy } from '../../src/site-runtime/r2'

function site(siteId: string): SiteContext {
  return { siteId, binding: { prepare() {} } as unknown as D1Database,
    routingVersion: 1, currentRoutingVersion: () => 1, identity: null }
}

describe('site R2 adapter', () => {
  it('keeps identical filenames separate for uploads, downloads and deletes', async () => {
    const data = new Map<string, string>()
    const bucket = {
      put: vi.fn(async (key: string, value: string) => { data.set(key, value); return { key } }),
      get: vi.fn(async (key: string) => data.has(key) ? { key, text: async () => data.get(key) } : null),
      delete: vi.fn(async (keys: string | string[]) => { for (const key of [keys].flat()) data.delete(key) }),
    }
    const r2 = createSiteR2Proxy(bucket as unknown as R2Bucket)
    await Promise.all(['a', 'b'].map(id => withSiteContext(site(id), async () => {
      await r2.put('image.png', id)
      const object = await r2.get('image.png')
      expect(object?.key).toBe('image.png')
      expect(await object?.text()).toBe(id)
    })))
    await withSiteContext(site('a'), () => r2.delete(['image.png']))
    expect([...data]).toEqual([['sites/b/image.png', 'b']])
  })

  it('rejects missing context, unsafe keys, stale routing and reused objects', async () => {
    const bucket = { head: vi.fn(async (key: string) => ({ key, size: 42 })) }
    const r2 = createSiteR2Proxy(bucket as unknown as R2Bucket)
    await expect(r2.head('x')).rejects.toThrow('context required')
    for (const key of ['../x', '/x', 'x/../y', 'x\\y', 'x\0y']) {
      await withSiteContext(site('a'), () => expect(r2.head(key)).rejects.toThrow('Invalid relative'))
    }
    const object = await withSiteContext(site('a'), () => r2.head('x'))
    withSiteContext(site('b'), () => expect(() => object?.size).toThrow('Cross-context'))
    const stale = { ...site('a'), currentRoutingVersion: () => 2 }
    expect(() => withSiteContext(stale, () => r2.head('x'))).toThrow('Stale')
    expect(bucket.head).toHaveBeenCalledTimes(1)
  })
})
