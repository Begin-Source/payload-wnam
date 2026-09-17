// @vitest-environment node
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { MessageChannel, receiveMessageOnPort, Worker, type MessagePort } from 'node:worker_threads'
import { describe, expect, it } from 'vitest'

const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const source = readFileSync(require.resolve('miniflare'),'utf8')
// Exercise the installed backport, not a reimplementation of its wait loop.
const start = source.indexOf('function receiveSynchronousReply('),end = source.indexOf('\nvar SynchronousFetcher = class {',start)
assert.ok(start > 0 && end > start,'Pinned Miniflare sync-reply backport missing')
const receiveReply = runInNewContext(`${source.slice(start,end)}; receiveSynchronousReply`,{
  Atomics,import_node_worker_threads: { receiveMessageOnPort },import_node_assert13: { default: assert },
}) as (handle: Int32Array,port: MessagePort,id: number) => { id: number; response: { status: number } }

// Based on Cloudflare's regression at workers-sdk commit 6f3d7b58. The reply
// producer deliberately wakes the consumer twice before publishing its reply.
const workerScript = `
const { parentPort,workerData } = require('node:worker_threads');
const { id,handle,start,port,stale } = workerData;
parentPort.postMessage('ready');
Atomics.wait(start,0,0);
let wakes = 0;
const deadline = Date.now()+3000;
while (wakes < stale && Date.now() < deadline) if (Atomics.notify(handle,0) === 1) wakes++;
port.postMessage({ id,response: { status: 204 } });
Atomics.store(handle,0,(id+1)|0); Atomics.notify(handle,0);
parentPort.postMessage(wakes); port.close();
`
describe('pinned Miniflare reply generations',() => {
  for (const [label,id,stale] of [['first reply',0,0],['stale notifications',1,2],['signed generation wrap',2147483647,2]] as const) {
    it(label,async () => {
      const channel = new MessageChannel(),handle = new Int32Array(new SharedArrayBuffer(4)),start = new Int32Array(new SharedArrayBuffer(4))
      const worker = new Worker(workerScript,{ eval: true,workerData: { id,handle,start,port: channel.port2,stale },transferList: [channel.port2] })
      try {
        await once(worker,'message')
        const count = once(worker,'message')
        Atomics.store(start,0,1); Atomics.notify(start,0)
        const reply = receiveReply(handle,channel.port1,id)
        expect(reply.id).toBe(id); expect(reply.response.status).toBe(204)
        expect((await count)[0]).toBe(stale)
      } finally { await worker.terminate(); channel.port1.close() }
    },10000)
  }
})
