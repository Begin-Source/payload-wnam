import { describe,expect,it } from 'vitest'
import { p1DataDeliveryCentralManifest,p1DataDeliverySelection,p1DataDeliverySiteManifest } from '../../scripts/p1-data-delivery-resources.mjs'

describe('P1 data delivery Queue resource manifests',() => {
  it('adds the pinned producer and consumer without mutating reviewed history',() => {
    const selected = p1DataDeliverySelection(),central = { queues: { producers: [{ binding: 'EXISTING',queue: 'existing' }] } },site = { name: 'site' }
    expect(p1DataDeliveryCentralManifest(central,selected).queues.producers).toEqual([
      { binding: 'EXISTING',queue: 'existing' },{ binding: 'DATA_DELIVERY_QUEUE',queue: selected.queue },
    ])
    expect(p1DataDeliverySiteManifest(site,selected).queues.consumers).toEqual([{ queue: selected.queue,
      dead_letter_queue: selected.deadLetterQueue,max_batch_size: 10,max_batch_timeout: 5,max_retries: 5,max_concurrency: 1 }])
    expect(central).toEqual({ queues: { producers: [{ binding: 'EXISTING',queue: 'existing' }] } }); expect(site).toEqual({ name: 'site' })
  })
})
