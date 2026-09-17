// @vitest-environment node
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { centralManagementMcp } from '../../src/site-control/managementMcp'
import { migrateSiteControl } from '../../src/site-control/schema'
import { registerSite } from '../../src/site-control/registry'

const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { Miniflare } = require('miniflare')
let mf: { getD1Database: (name: string) => Promise<D1Database>; dispose: () => Promise<void> }, db: D1Database
const origin = 'https://p1-hub.beginos.org', url = origin+'/mcp'
const token = 'Bearer fixture.user7.signature', otherToken = 'Bearer fixture.user8.signature'
const identity = { userId: '7',sessionId: 'session-seven' }
const authenticate = async (request: Request) => request.headers.get('authorization') === token ? identity :
  request.headers.get('authorization') === otherToken ? { userId: '8',sessionId: 'session-eight' } : null
const options = () => ({ centralOrigin: origin,database: db,authenticate })
const rpc = (method: string,params: unknown = {},id = 1) => ({ jsonrpc: '2.0',id,method,params })
const send = (body: unknown,headers: Record<string,string> = {}) => centralManagementMcp(new Request(url,{ method: 'POST',
  headers: { authorization: token,'content-type': 'application/json',accept: 'application/json, text/event-stream','mcp-protocol-version': '2025-11-25',...headers },
  body: JSON.stringify(body) }),options())
async function client(bearer = token) {
  const value = new Client({ name: 'p1-mcp-test',version: '1.0.0' })
  await value.connect(new StreamableHTTPClientTransport(new URL(url),{ requestInit: { headers: { authorization: bearer } },
    fetch: async (input,init) => centralManagementMcp(new Request(input,init),options()) }))
  return value
}

describe('central site management MCP with real SDK client and native D1',() => {
  beforeAll(async () => {
    mf = new Miniflare({ modules: true,script: 'export default { fetch() { return new Response("fixture") } }',compatibilityDate: '2025-08-15',d1Databases: ['CENTRAL'] })
    db = await mf.getD1Database('CENTRAL')
    await db.batch([
      db.prepare('CREATE TABLE users (id INTEGER PRIMARY KEY,email TEXT,lock_until TEXT)'),
      db.prepare('CREATE TABLE users_sessions (id TEXT PRIMARY KEY,_parent_id INTEGER,expires_at TEXT)'),
    ])
    await migrateSiteControl(db)
  })
  afterAll(async () => { await mf?.dispose() })
  beforeEach(async () => {
    await db.batch(['site_lifecycle_operations','site_login_tickets','site_login_sessions','site_runtime_access','site_runtime_registry','users_sessions','users'].map(name => db.prepare(`DELETE FROM ${name}`)))
    await db.batch([
      db.prepare("INSERT INTO users VALUES (7,'seven@example.invalid',NULL),(8,'eight@example.invalid',NULL)"),
      db.prepare('INSERT INTO users_sessions VALUES (?,7,?),(?,8,?)').bind(identity.sessionId,new Date(Date.now()+3600000).toISOString(),'session-eight',new Date(Date.now()+3600000).toISOString()),
    ])
    for (const [index,siteId] of ['a','b'].entries()) await registerSite(db,{ siteId,localSiteId: index+1,
      databaseId: `${index+1}0000000-1111-4111-8111-111111111111`,bindingName: `SITE_D1_${siteId.toUpperCase()}`,workerGroup: 'group-1',
      adminHost: `cms-site-${siteId}.beginos.org`,schemaVersion: 1,routingVersion: 1,migrationState: 'active',timezone: 'UTC',productionEnabled: false,operationId: `provision-${siteId}` })
    await db.prepare("INSERT INTO site_runtime_access VALUES ('a','7','manager'),('b','7','editor'),('b','8','manager')").run()
  })

  it('initializes the real SDK client, advertises explicit targets and isolates concurrent principals',async () => {
    const first = await client(), second = await client(otherToken)
    try {
      const { tools } = await first.listTools()
      expect(tools.map(tool => tool.name).sort()).toEqual(['get_site','pause_site','resume_site'])
      for (const tool of tools) { expect(tool.inputSchema.required).toContain('siteId'); expect(tool.inputSchema.additionalProperties).toBe(false) }
      const results = await Promise.all(Array.from({ length: 20 },(_,index) => (index%2 ? second : first)
        .callTool({ name: 'get_site',arguments: { siteId: index%2 ? 'b' : 'a' } })))
      results.forEach((result,index) => expect(result.structuredContent).toMatchObject({ siteId: index%2 ? 'b' : 'a',role: 'manager',routingVersion: 1 }))
      expect((await second.callTool({ name: 'get_site',arguments: { siteId: 'a' } })).structuredContent).toMatchObject({ status: 403 })
    } finally { await first.close(); await second.close() }
  })
  it('never guesses a site or accepts infrastructure, role or user overrides',async () => {
    const value = await client()
    try {
      for (const args of [{},{ siteId: ['a','b'] },{ siteId: 'cms-site-a.beginos.org' },{ siteId: 1 },{ siteId: 'a',userId: '8' },
        { siteId: 'a',databaseId: 'other' },{ siteId: 'a',role: 'manager' }]) {
        expect((await value.callTool({ name: 'get_site',arguments: args })).isError).toBe(true)
      }
      expect((await value.callTool({ name: 'get_site',arguments: { siteId: 'unassigned' } })).structuredContent).toMatchObject({ status: 403 })
      expect((await value.callTool({ name: 'delete_site',arguments: { siteId: 'a' } })).isError).toBe(true)
      expect(await db.prepare('SELECT COUNT(*) FROM site_lifecycle_operations').first('COUNT(*)')).toBe(0)
    } finally { await value.close() }
  })
  it('uses the same atomic lifecycle receipts for MCP retries, conflicts and real-time grant revocation',async () => {
    const value = await client()
    const operation = { siteId: 'a',expectedRoutingVersion: 1,operationId: crypto.randomUUID() }
    try {
      const [first,second] = await Promise.all([1,2].map(() => value.callTool({ name: 'pause_site',arguments: operation })))
      expect(first.structuredContent).toMatchObject({ routingVersion: 2 })
      expect(second.structuredContent).toMatchObject({ routingVersion: 2 })
      expect([first.structuredContent,second.structuredContent].filter(item => item?.replayed === false)).toHaveLength(1)
      expect((await value.callTool({ name: 'pause_site',arguments: { ...operation,siteId: 'b' } })).structuredContent).toMatchObject({ status: 403 })
      expect((await value.callTool({ name: 'resume_site',arguments: { ...operation,expectedRoutingVersion: 2 } })).structuredContent).toMatchObject({ status: 409 })
      expect((await value.callTool({ name: 'resume_site',arguments: { ...operation,expectedRoutingVersion: 2,operationId: crypto.randomUUID() } })).structuredContent).toMatchObject({ routingVersion: 3 })
      await db.prepare("UPDATE site_runtime_access SET role='editor' WHERE site_id='a' AND user_id='7'").run()
      expect((await value.callTool({ name: 'pause_site',arguments: operation })).structuredContent).toMatchObject({ status: 403 })
      await db.prepare("DELETE FROM site_runtime_access WHERE site_id='a' AND user_id='7'").run()
      expect((await value.callTool({ name: 'get_site',arguments: { siteId: 'a' } })).structuredContent).toMatchObject({ status: 403 })
      expect(await db.prepare("SELECT routing_version FROM site_runtime_registry WHERE site_id='b'").first('routing_version')).toBe(1)
    } finally { await value.close() }
  })
  it('requires Bearer auth independently of cookies and invalidates established clients after logout',async () => {
    const value = await client()
    try {
      expect((await send(rpc('tools/list'),{ authorization: '',cookie: 'payload-token=valid-browser-cookie' })).status).toBe(401)
      const request = new Request(url,{ method: 'POST',headers: { authorization: token,cookie: 'payload-token=wrong-person',origin,
        'content-type': 'application/json',accept: 'application/json, text/event-stream' },body: JSON.stringify(rpc('tools/list')) })
      const response = await centralManagementMcp(request,{ ...options(),authenticate: async req => {
        expect(req.headers.has('cookie')).toBe(false); expect(req.headers.has('origin')).toBe(false)
        return authenticate(req)
      } })
      expect(response.status).toBe(200); await response.text()
      await db.prepare('DELETE FROM users_sessions WHERE _parent_id=7').run()
      await expect(value.listTools()).rejects.toThrow()
      expect((await send(rpc('tools/list'))).status).toBe(401)
    } finally { await value.close() }
  })
  it('enforces origin, single bounded JSON message, protocol headers and no-store responses',async () => {
    expect((await send(rpc('tools/list'),{ origin: 'https://evil.example' })).status).toBe(403)
    expect((await send(rpc('tools/list'),{ origin: 'null' })).status).toBe(403)
    expect((await send([rpc('tools/list'),rpc('tools/list',{},2)])).status).toBe(400)
    expect((await send({ ...rpc('tools/list'),padding: 'x'.repeat(16384) })).status).toBe(400)
    expect((await send(rpc('tools/list'),{ 'mcp-protocol-version': '2099-01-01' })).status).toBe(400)
    expect((await send(rpc('tools/list'),{ accept: 'application/json' })).status).toBe(406)
    const response = await send(rpc('tools/list'))
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.has('mcp-session-id')).toBe(false); await response.text()
    const notification = await send({ jsonrpc: '2.0',method: 'notifications/initialized' })
    expect(notification.status).toBe(202); expect(await notification.text()).toBe('')
    for (const method of ['GET','DELETE','OPTIONS']) expect((await centralManagementMcp(new Request(url,{ method,headers: { authorization: token } }),options())).status).toBe(405)
    expect((await centralManagementMcp(new Request('https://evil.example/mcp',{ headers: { authorization: token,'x-forwarded-host': 'p1-hub.beginos.org' } }),options())).status).toBe(404)
    expect((await centralManagementMcp(new Request(url+'?siteId=a',{ headers: { authorization: token } }),options())).status).toBe(404)
  })
  it('redacts infrastructure failures and refuses locked or expired central sessions',async () => {
    await db.prepare("UPDATE users SET lock_until='not-a-date' WHERE id=7").run()
    expect((await send(rpc('tools/list'))).status).toBe(401)
    await db.prepare('UPDATE users SET lock_until=NULL WHERE id=7').run()
    await db.prepare("UPDATE users_sessions SET expires_at='2000-01-01' WHERE _parent_id=7").run()
    expect((await send(rpc('tools/list'))).status).toBe(401)
    const response = await centralManagementMcp(new Request(url,{ headers: { authorization: token } }),{ ...options(),authenticate: async () => { throw new Error('private SQL or signing details') } })
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('private SQL')
  })
})
