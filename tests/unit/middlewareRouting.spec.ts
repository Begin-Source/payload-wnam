// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'
afterEach(() => vi.unstubAllGlobals())
it('redirects the legacy central host to the formal Agent Hub domain', async () => {
  const response = await middleware(
    new NextRequest('https://hub.beginos.org/admin/login?next=%2Fadmin', {
      headers: { host: 'hub.beginos.org' },
    }),
  )
  expect(response.status).toBe(308)
  expect(response.headers.get('location')).toBe(
    'https://agenthub.beginos.org/admin/login?next=%2Fadmin',
  )
})
it('uses one bounded lookup for locale and CMS redirect decisions', async () => {
  const fetchMock = vi.fn(async () => Response.json({ ok: true, publicLocales: ['en'], defaultPublicLocale: 'en', redirect: { toPath: '/en/new', statusCode: 302 } }))
  vi.stubGlobal('fetch', fetchMock)
  const response = await middleware(new NextRequest('https://example.test/en/old', { headers: { host: 'example.test' } }))
  expect(response.status).toBe(302)
  expect(response.headers.get('location')).toBe('https://example.test/en/new')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const args = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(args[0]).toContain('/api/site-routing-meta?path=')
  expect(args[1].signal).toBeDefined()
})
it('keeps locale correction ahead of CMS redirects and preserves search', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true, publicLocales: ['en'], defaultPublicLocale: 'en', redirect: { toPath: '/wrong', statusCode: 301 } })))
  const response = await middleware(new NextRequest('https://example.test/zh/posts?q=one', { headers: { host: 'example.test' } }))
  expect(response.status).toBe(308)
  expect(response.headers.get('location')).toBe('https://example.test/en/posts?q=one')
})
it('continues an already localized page when the internal lookup times out', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout') }))
  const response = await middleware(new NextRequest('https://example.test/en/posts', { headers: { host: 'example.test' } }))
  expect(response.headers.get('x-middleware-next')).toBe('1')
})
