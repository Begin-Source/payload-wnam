import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { P1_ACCOUNT } from './p1-manifests.mjs'

export const DATA_DELIVERY_QUEUE_BINDING = 'DATA_DELIVERY_QUEUE'

export function p1DataDeliverySelection() {
  const value = JSON.parse(readFileSync('operations/p1-data-delivery.json','utf8'))
  assert.deepEqual(Object.keys(value).sort(),['deadLetterQueue','deadLetterQueueId','enabled','queue','queueId','workerGroup'])
  assert.deepEqual(value,{
    enabled: true,workerGroup: 'p1-group-1',queue: 'payload-wnam-p1-data-group-1',
    queueId: '8e1846e9fcce4b4ba163f185063a9580',deadLetterQueue: 'payload-wnam-p1-data-group-1-dlq',
    deadLetterQueueId: '7d2fe1c8056e41bea82130e0b89c04a1',
  })
  return value
}

export async function ensureP1DataDeliveryResources(token) {
  assert.ok(process.env.WORKERS_CI === '1' && typeof token === 'string' && token.length >= 20)
  const selected = p1DataDeliverySelection()
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${P1_ACCOUNT}/queues?per_page=100`,{
    headers: { authorization: `Bearer ${token}` },signal: AbortSignal.timeout(30000),
  })
  const value = await response.json()
  if (!response.ok || !value.success || !Array.isArray(value.result)) throw new Error('P1 data delivery queue inventory unavailable')
  const exact = (name,id) => {
    const matches = value.result.filter(queue => queue.queue_name === name)
    assert.equal(matches.length,1,`Pinned data delivery queue unavailable: ${name}`)
    assert.equal(matches[0].queue_id,id,`Pinned data delivery queue identity changed: ${name}`)
  }
  exact(selected.queue,selected.queueId); exact(selected.deadLetterQueue,selected.deadLetterQueueId)
  return selected
}

export function p1DataDeliveryCentralManifest(base,selected = p1DataDeliverySelection()) {
  const config = structuredClone(base),queues = config.queues ?? {}
  config.queues = { ...queues,producers: [...(queues.producers ?? []),{ binding: DATA_DELIVERY_QUEUE_BINDING,queue: selected.queue }] }
  return config
}

export function p1DataDeliverySiteManifest(base,selected = p1DataDeliverySelection()) {
  const config = structuredClone(base),queues = config.queues ?? {}
  config.queues = { ...queues,consumers: [...(queues.consumers ?? []),{ queue: selected.queue,dead_letter_queue: selected.deadLetterQueue,
    max_batch_size: 10,max_batch_timeout: 5,max_retries: 5,max_concurrency: 1 }] }
  return config
}
