import { describe,expect,it } from 'vitest'
import { p1DispatchManifest,p1DispatchSelection } from '../../scripts/p1-dispatch-resources.mjs'

describe('P1 automatic dispatch resource manifest',() => {
  it('adds only the reviewed queue, cron and non-secret build identity',() => {
    const selected = p1DispatchSelection()
    const base = { name: 'payload-wnam-p1-central',vars: { CENTRAL_ORIGIN: 'https://p1-hub.beginos.org' } }
    const manifest = p1DispatchManifest(base,{ selected,subscriptionId: 'a'.repeat(32) })
    expect(manifest).toMatchObject({
      triggers: { crons: ['*/2 * * * *'] },
      queues: {
        producers: [{ binding: 'PROVISION_DISPATCH_QUEUE',queue: selected.queue }],
        consumers: [{ queue: selected.queue,dead_letter_queue: selected.deadLetterQueue,max_batch_size: 10,
          max_batch_timeout: 5,max_retries: 5,max_concurrency: 1 }],
      },
      vars: { PROVISION_BUILD_EVENT_SUBSCRIPTION_ID: 'a'.repeat(32),PROVISION_BUILD_BRANCH: 'feat/site-per-d1',
        PROVISION_BUILD_WORKER: 'payload-wnam',PROVISION_BUILD_REPOSITORY: 'payload-wnam',
        PROVISION_BUILD_REPOSITORY_OWNER: 'Begin-Source' },
    })
    expect(JSON.stringify(manifest)).not.toMatch(/deploy_hooks|HOOK_URL/)
    expect(base).toEqual({ name: 'payload-wnam-p1-central',vars: { CENTRAL_ORIGIN: 'https://p1-hub.beginos.org' } })
  })
})
