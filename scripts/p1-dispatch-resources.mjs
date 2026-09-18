import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { P1_ACCOUNT } from './p1-manifests.mjs'

const expectedEvents = ['build.started','build.failed','build.canceled','build.succeeded']

export function p1DispatchSelection() {
  const value = JSON.parse(readFileSync('operations/p1-dispatch.json','utf8'))
  assert.deepEqual(Object.keys(value).sort(),['buildBranch','buildWorker','cron','deadLetterQueue','deadLetterQueueId','deployHook','enabled','events','queue','queueId','repository','repositoryOwner','subscription','subscriptionId'])
  assert.equal(value.enabled,true)
  assert.deepEqual(value,{
    enabled: true,queue: 'payload-wnam-p1-provision-dispatch',queueId: '77a4a2fb48a74fb38b35f386f7ae4120',
    deadLetterQueue: 'payload-wnam-p1-provision-dispatch-dlq',deadLetterQueueId: '02e5a98229d24a548d511343679fd459',
    subscription: 'payload-wnam-p1-provision-builds',subscriptionId: '7b5f032aa0974ce0978b232b2e770fc5',
    events: expectedEvents,
    deployHook: 'P1 automatic site provision',buildWorker: 'payload-wnam',
    buildBranch: 'feat/site-per-d1',repositoryOwner: 'Begin-Source',repository: 'payload-wnam',cron: '*/2 * * * *',
  })
  return value
}

const same = (left,right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())

/** Idempotently verifies the pinned queues. Builds API access is deliberately
 * absent from the deploy token: an account administrator creates the reviewed
 * Hook/subscription once, and the Hook URL enters only through an encrypted
 * Cloudflare Builds secret. */
export async function ensureP1DispatchResources(token) {
  assert.ok(process.env.WORKERS_CI === '1' && typeof token === 'string' && token.length >= 20)
  const selected = p1DispatchSelection()
  const api = async (path,init = {}) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${P1_ACCOUNT}/${path}`,{
      ...init,headers: { authorization: `Bearer ${token}`,'content-type': 'application/json',...(init.headers ?? {}) },
      signal: AbortSignal.timeout(30000),
    })
    const value = await response.json()
    if (!response.ok || !value.success) throw new Error(`P1 dispatch resource API failed: ${path} (${response.status})`)
    return value.result
  }
  const queues = await api('queues?per_page=100')
  const requireQueue = name => {
    const matches = queues.filter(queue => queue.queue_name === name)
    assert.equal(matches.length,1,`Pinned P1 queue unavailable: ${name}`)
    return matches[0]
  }
  const queue = requireQueue(selected.queue),deadLetterQueue = requireQueue(selected.deadLetterQueue)
  assert.equal(queue.queue_id,selected.queueId); assert.equal(deadLetterQueue.queue_id,selected.deadLetterQueueId)
  assert.match(selected.subscriptionId,/^[a-f0-9]{32}$/); assert.ok(same(selected.events,expectedEvents))
  const deployHookUrl = process.env.P1_PROVISION_DEPLOY_HOOK_URL
  assert.match(deployHookUrl ?? '',/^https:\/\/api\.cloudflare\.com\/client\/v4\/workers\/builds\/deploy_hooks\/[a-f0-9-]{36}$/,
    'Encrypted P1 Deploy Hook build secret unavailable')
  return { selected,queueId: queue.queue_id,deadLetterQueueId: deadLetterQueue.queue_id,
    subscriptionId: selected.subscriptionId,deployHookUrl }
}

export function p1DispatchManifest(base,resources) {
  const { selected } = resources,config = structuredClone(base)
  config.vars = { ...config.vars,PROVISION_BUILD_ACCOUNT_ID: P1_ACCOUNT,
    PROVISION_BUILD_EVENT_SUBSCRIPTION_ID: resources.subscriptionId,PROVISION_BUILD_WORKER: selected.buildWorker,
    PROVISION_BUILD_BRANCH: selected.buildBranch,PROVISION_BUILD_REPOSITORY: selected.repository,
    PROVISION_BUILD_REPOSITORY_OWNER: selected.repositoryOwner }
  config.triggers = { crons: [selected.cron] }
  config.queues = {
    producers: [{ binding: 'PROVISION_DISPATCH_QUEUE',queue: selected.queue }],
    consumers: [{ queue: selected.queue,dead_letter_queue: selected.deadLetterQueue,max_batch_size: 10,
      max_batch_timeout: 5,max_retries: 5,max_concurrency: 1 }],
  }
  return config
}
