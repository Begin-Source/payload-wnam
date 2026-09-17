import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

/** Real SDK client, real central JWT, all HTTP through Chromium so the cloud
 * fixture remains inside its host mapping and remote checks use real DNS/TLS.
 * The token lives only in this process/page call; never log headers or cookies. */
export async function checkMcpBrowser({ hub,siteId,otherSiteId,siteRequest,otherSiteRequest }) {
  const origin = new URL(hub.url()).origin
  const cookie = (await hub.context().cookies(origin)).find(cookie => cookie.name === 'payload-token')
  assert.ok(cookie?.value,'Real central login cookie required for MCP acceptance')
  const authorization = `Bearer ${cookie.value}`
  const invoke = async (body,extra = {}) => hub.evaluate(async ({ body,authorization,extra }) => {
    const response = await fetch('/mcp',{ method: 'POST',credentials: extra.cookies ? 'same-origin' : 'omit',
      signal: AbortSignal.timeout(20000),headers: { 'content-type': 'application/json',accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-11-25',...(extra.cookieOnly ? {} : { authorization: extra.invalid ? 'Bearer invalid.jwt.signature' : authorization }) },
      body: JSON.stringify(body) })
    return { status: response.status,body: await response.text(),cacheControl: response.headers.get('cache-control') }
  },{ body,authorization,extra })
  const browserFetch = async (input,init) => {
    const request = new Request(input,init), url = new URL(request.url)
    assert.ok(url.origin === origin && url.pathname === '/mcp' && !url.search,'SDK transport must stay on the selected MCP endpoint')
    const body = ['GET','HEAD'].includes(request.method) ? null : await request.text()
    const response = await hub.evaluate(async args => {
      const response = await fetch('/mcp',{ ...args,credentials: 'omit',redirect: 'error',signal: AbortSignal.timeout(20000) })
      return { status: response.status,body: await response.text(),headers: [...response.headers.entries()] }
    },{ method: request.method,headers: [...request.headers.entries()],body })
    assert.equal(new Headers(response.headers).get('cache-control'),'private, no-store')
    return new Response([202,204,304].includes(response.status) ? null : response.body,{ status: response.status,headers: response.headers })
  }
  const client = new Client({ name: 'p1-cloud-acceptance',version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',origin),{ requestInit: { headers: { authorization } },fetch: browserFetch }))
  const call = async (name,args) => client.callTool({ name,arguments: args })
  const read = async id => {
    const result = await call('get_site',{ siteId: id })
    assert.ok(!result.isError,'MCP site read must succeed')
    return result.structuredContent
  }
  let initial, pauseOperation, completed = false
  try {
    const tools = (await client.listTools()).tools
    assert.deepEqual(tools.map(tool => tool.name).sort(),['get_site','pause_site','resume_site'])
    assert.ok(tools.every(tool => tool.inputSchema.required.includes('siteId') && tool.inputSchema.additionalProperties === false))
    const list = { jsonrpc: '2.0',id: 900,method: 'tools/list',params: {} }
    assert.equal((await invoke(list,{ cookies: true,cookieOnly: true })).status,401,'Browser cookie alone must not authorize MCP')
    assert.equal((await invoke(list,{ cookies: true,invalid: true })).status,401,'Valid cookie must not rescue an invalid Bearer')
    for (const args of [{},{ siteId: [siteId,otherSiteId ?? 'other'] },{ siteId,userId: '8' },{ siteId,databaseId: 'caller-selected' }]) {
      assert.equal((await call('get_site',args)).isError,true)
    }
    assert.equal((await call('get_site',{ siteId: 'unassigned-site' })).structuredContent.status,403)
    initial = await read(siteId)
    const other = otherSiteId ? await read(otherSiteId) : null
    assert.equal(initial.state,'active'); assert.equal(initial.role,'manager')
    pauseOperation = { siteId,expectedRoutingVersion: initial.routingVersion,operationId: crypto.randomUUID() }
    const paused = await call('pause_site',pauseOperation)
    assert.ok(!paused.isError); assert.equal(paused.structuredContent.routingVersion,initial.routingVersion+1)
    const retry = await call('pause_site',pauseOperation)
    assert.equal(retry.structuredContent.replayed,true)
    assert.equal((await call('pause_site',{ ...pauseOperation,operationId: crypto.randomUUID() })).structuredContent.status,409)
    if (siteRequest) assert.equal((await siteRequest()).status,503)
    if (otherSiteRequest) assert.equal((await otherSiteRequest()).status,200)
    const resumed = await call('resume_site',{ siteId,expectedRoutingVersion: initial.routingVersion+1,operationId: crypto.randomUUID() })
    assert.ok(!resumed.isError); assert.equal(resumed.structuredContent.routingVersion,initial.routingVersion+2)
    assert.equal((await read(siteId)).state,'active')
    if (siteRequest) assert.equal((await siteRequest()).status,403)
    if (other) assert.deepEqual(await read(otherSiteId),other)
    console.log(JSON.stringify({ event: 'p1_mcp_browser_passed',siteId,fromVersion: initial.routingVersion,toVersion: initial.routingVersion+2,
      checks: ['real-sdk-client','real-central-bearer','cookie-only-denied','invalid-bearer-valid-cookie-denied','strict-explicit-site-id','unknown-site-denied',
        'manager-pause-resume','idempotent-retry','routing-conflict',...(siteRequest ? ['old-cookie-denied','other-site-unaffected'] : [])] }))
    completed = true
    return {
      close: () => client.close(),
      assertRevokedSite: async () => {
        assert.equal((await call('get_site',{ siteId })).structuredContent.status,403)
        assert.equal((await call('pause_site',pauseOperation)).structuredContent.status,403)
        console.log(JSON.stringify({ event: 'p1_mcp_grant_revocation_passed',siteId }))
      },
      assertRevokedSession: async () => {
        assert.equal((await invoke(list)).status,401)
        await assert.rejects(client.listTools())
        console.log(JSON.stringify({ event: 'p1_mcp_session_revocation_passed',siteId }))
      },
    }
  } finally {
    if (!completed) {
      try {
        if (initial && pauseOperation) {
          const current = await read(siteId)
          if (current.state === 'paused') {
            const receipt = await call('pause_site',pauseOperation)
            assert.ok(!receipt.isError && receipt.structuredContent.routingVersion === current.routingVersion,'Recovery requires our own committed pause')
            const recovery = { siteId,expectedRoutingVersion: current.routingVersion,operationId: crypto.randomUUID() }
            let restored = false
            for (let attempt = 0; attempt < 3 && !restored; attempt++) {
              try { restored = !(await call('resume_site',recovery)).isError } catch { /* same operation ID on retry */ }
            }
            assert.equal(restored,true,'MCP smoke recovery must restore the test site')
          }
        }
      } finally { await client.close() }
    }
  }
}
