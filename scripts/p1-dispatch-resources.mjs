import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { P1_ACCOUNT } from './p1-manifests.mjs'

const expectedEvents = ['build.started','build.failed','build.canceled','build.succeeded']

export function p1DispatchSelection() {
  const value = JSON.parse(readFileSync('operations/p1-dispatch.json','utf8'))
  assert.deepEqual(Object.keys(value).sort(),['buildBranch','buildWorker','cron','deadLetterQueue','deployHook','enabled','queue','repository','repositoryOwner','subscription'])
  assert.equal(value.enabled,true)
  assert.deepEqual(value,{
    enabled: true,queue: 'payload-wnam-p1-provision-dispatch',deadLetterQueue: 'payload-wnam-p1-provision-dispatch-dlq',
    subscription: 'payload-wnam-p1-provision-builds',deployHook: 'P1 automatic site provision',buildWorker: 'payload-wnam',
    buildBranch: 'feat/site-per-d1',repositoryOwner: 'Begin-Source',repository: 'payload-wnam',cron: '*/2 * * * *',
  })
  return value
}

const same = (left,right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())

/** Idempotently creates only the explicitly named P1 dispatch resources. The
 * Hook UUID is returned in memory as a secret URL and is never logged or
 * written to an artifact. */
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
  let queues = await api('queues?per_page=100')
  const ensureQueue = async name => {
    const matches = queues.filter(queue => queue.queue_name === name)
    assert.ok(matches.length <= 1,`Duplicate P1 queue: ${name}`)
    if (matches.length) return matches[0]
    const created = await api('queues',{ method: 'POST',body: JSON.stringify({ queue_name: name }) })
    queues = [...queues,created]; return created
  }
  const queue = await ensureQueue(selected.queue),deadLetterQueue = await ensureQueue(selected.deadLetterQueue)
  assert.match(queue.queue_id,/^[a-f0-9]{32}$/); assert.match(deadLetterQueue.queue_id,/^[a-f0-9]{32}$/)

  const hooks = await api(`builds/workers/${selected.buildWorker}/deploy_hooks`)
  const namedHooks = hooks.filter(hook => hook.deploy_hook_name === selected.deployHook)
  assert.ok(namedHooks.length <= 1,'Duplicate P1 provision Deploy Hook')
  let hook = namedHooks[0]
  if (!hook) hook = await api(`builds/workers/${selected.buildWorker}/deploy_hooks`,{
    method: 'POST',body: JSON.stringify({ branch: selected.buildBranch,deploy_hook_name: selected.deployHook }),
  })
  assert.equal(hook.branch,selected.buildBranch); assert.match(hook.deploy_hook_uuid,/^[a-f0-9-]{36}$/)

  const subscriptions = await api('event_subscriptions/subscriptions?per_page=100')
  const namedSubscriptions = subscriptions.filter(subscription => subscription.name === selected.subscription)
  assert.ok(namedSubscriptions.length <= 1,'Duplicate P1 build event subscription')
  let subscription = namedSubscriptions[0]
  if (!subscription) subscription = await api('event_subscriptions/subscriptions',{
    method: 'POST',body: JSON.stringify({ name: selected.subscription,enabled: true,
      source: { type: 'workersBuilds.worker',worker_name: selected.buildWorker },events: expectedEvents,
      destination: { type: 'queues.queue',queue_id: queue.queue_id } }),
  })
  assert.equal(subscription.enabled,true); assert.equal(subscription.destination?.type,'queues.queue')
  assert.equal(subscription.destination?.queue_id,queue.queue_id)
  assert.equal(subscription.source?.type,'workersBuilds.worker'); assert.equal(subscription.source?.worker_name,selected.buildWorker)
  assert.ok(same(subscription.events,expectedEvents),'P1 build event subscription differs from review')
  assert.match(subscription.id,/^[a-f0-9]{32}$/)
  return { selected,queueId: queue.queue_id,deadLetterQueueId: deadLetterQueue.queue_id,
    subscriptionId: subscription.id,deployHookUrl: `https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/${hook.deploy_hook_uuid}` }
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
