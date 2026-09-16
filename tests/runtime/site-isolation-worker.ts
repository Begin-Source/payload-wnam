import { bindSiteCallback, requireSiteContext, withSiteContext, type SiteContext } from '../../src/site-runtime/context'
import { createSiteD1Proxy } from '../../src/site-runtime/d1'

type Env = { SITE_A: D1Database; SITE_B: D1Database; MEDIA: R2Bucket; JOBS: Queue }
type Job = { siteId: 'a' | 'b'; id: number }
const db = createSiteD1Proxy()
const context = (env: Env, siteId: string): SiteContext => {
  if (siteId !== 'a' && siteId !== 'b') throw new Error('Unknown fixture site')
  return { siteId, binding: siteId === 'a' ? env.SITE_A : env.SITE_B, routingVersion: 1, currentRoutingVersion: () => 1, identity: null }
}
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message) }
const rejects = (fn: () => unknown) => {
  let denied = false
  try { fn() } catch { denied = true }
  assert(denied, 'Unsafe database operation was accepted')
}

export default {
  async fetch(request: Request, env: Env) {
    const [, action, siteId, idText] = new URL(request.url).pathname.split('/')
    if (action === 'guards') {
      rejects(() => db.prepare('SELECT 1'))
      const a = context(env, 'a'), b = context(env, 'b')
      const statement = withSiteContext(a, () => db.prepare('SELECT 1'))
      withSiteContext(b, () => {
        rejects(() => statement.run())
        rejects(() => db.batch([statement]))
        rejects(() => db.batch([env.SITE_B.prepare('SELECT 1')]))
      })
      let version = 1
      withSiteContext({ ...a, currentRoutingVersion: () => version }, () => {
        const query = db.prepare('SELECT 1')
        version++
        rejects(() => query.first())
      })
      rejects(() => db.withSession())
      return Response.json({ ok: true })
    }
    return withSiteContext(context(env, siteId), async () => {
      const id = Number(idText)
      if (action === 'stream') {
        const pull = bindSiteCallback(async (controller: ReadableStreamDefaultController) => {
          const row = await db.prepare('SELECT value FROM records WHERE id = 1').first<{ value: string }>()
          controller.enqueue(new TextEncoder().encode(row?.value))
          controller.close()
        })
        return new Response(new ReadableStream({ pull }))
      }
      if (action === 'enqueue') {
        await env.JOBS.send({ siteId: requireSiteContext().siteId, id })
        return Response.json({ ok: true })
      }
      if (action !== 'crud') return new Response('Unknown test', { status: 404 })
      const sentinel = await db.prepare('SELECT value FROM records WHERE id = 1').first<{ value: string }>()
      assert(sentinel?.value === siteId, 'Cross-site read')
      await db.batch([
        db.prepare('INSERT INTO records (id, value) VALUES (?, ?)').bind(id, siteId),
        db.prepare('UPDATE records SET value = ? WHERE id = ?').bind(`${siteId}-updated`, id),
      ])
      const row = await db.prepare('SELECT value FROM records WHERE id = ?').bind(id).first<{ value: string }>()
      assert(row?.value === `${siteId}-updated`, 'Cross-site batch')
      await db.prepare('DELETE FROM records WHERE id = ?').bind(id).run()
      assert(await db.prepare('SELECT id FROM records WHERE id = ?').bind(id).first() === null, 'Delete failed')
      // An actual D1 batch must roll back its first write when its second statement fails.
      let rolledBack = false
      try {
        await db.batch([
          db.prepare('INSERT INTO records (id, value) VALUES (?, ?)').bind(id, 'must-rollback'),
          db.prepare('INSERT INTO records (id, value) VALUES (1, ?)').bind('duplicate'),
        ])
      } catch { rolledBack = true }
      assert(rolledBack, 'Invalid batch succeeded')
      assert(await db.prepare('SELECT id FROM records WHERE id = ?').bind(id).first() === null, 'Batch did not roll back')
      const mediaKey = `sites/${requireSiteContext().siteId}/fixture-${id}.txt`
      await env.MEDIA.put(mediaKey, siteId)
      assert(await (await env.MEDIA.get(mediaKey))?.text() === siteId, 'Cross-site media')
      const cacheKey = new Request(`https://isolation.test/sites/${siteId}/v1/${id}`)
      const publicCache = await caches.open('site-isolation')
      await publicCache.put(cacheKey, new Response(siteId, { headers: { 'cache-control': 'public, max-age=300' } }))
      assert(await (await publicCache.match(cacheKey))?.text() === siteId, 'Cross-site cache')
      return Response.json({ ok: true, siteId, id })
    })
  },
  async queue(batch: MessageBatch<Job>, env: Env) {
    await Promise.all(batch.messages.map(message => withSiteContext(context(env, message.body.siteId), async () => {
      await db.prepare('INSERT INTO jobs (id, value) VALUES (?, ?) ON CONFLICT(id) DO NOTHING')
        .bind(message.body.id, requireSiteContext().siteId).run()
      message.ack()
    })))
  },
} satisfies ExportedHandler<Env, Job>
