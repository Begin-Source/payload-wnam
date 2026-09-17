import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { payloadSessionAuthority } from './payloadSessionAuthority'
import { privateResponse, requireCentralOrigin } from './sessionHttp'
import { changeSiteLifecycle, getManagedSite, SiteManagementError, type CentralIdentity } from './siteLifecycle'

type Options = { centralOrigin: string; database: D1Database; authenticate: (request: Request) => Promise<CentralIdentity | null> }
const siteIdSchema = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/).describe('Explicit stable site ID from the central site chooser; never a local numeric ID or a hostname.')
const lifecycleSchema = z.object({ siteId: siteIdSchema,
  expectedRoutingVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER-1).describe('Current routingVersion returned by get_site; preserve this value on a retry.'),
  operationId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{15,127}$/).describe('A unique operation ID, preferably UUID; reuse exactly for retries of this action.'),
}).strict()

async function result(operation: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
  try {
    const value = await operation()
    return { content: [{ type: 'text',text: JSON.stringify(value) }],structuredContent: value }
  } catch (error) {
    const value = { status: error instanceof SiteManagementError ? error.status : 503,
      message: error instanceof SiteManagementError ? error.message : 'Site management unavailable' }
    return { isError: true,content: [{ type: 'text',text: JSON.stringify(value) }],structuredContent: value }
  }
}

function createServer(database: D1Database, identity: CentralIdentity) {
  const server = new McpServer({ name: 'payload-site-control',version: '1.0.0' },{
    instructions: 'Every tool requires an explicit stable siteId. Use get_site before changing state. A retry must preserve the operationId and expectedRoutingVersion. Pause affects CMS access; it does not drain production jobs.',
    // This server offers no sampling/elicitation. Refuse it rather than creating
    // the SDK's default eval-based JSON Schema compiler in a Worker. Tool input
    // validation uses the SDK's actual Zod schemas below.
    jsonSchemaValidator: { getValidator: () => { throw new Error('Elicitation is not supported') } },
  })
  server.registerTool('get_site',{
    description: 'Read the selected site state, routing version and your current role. Requires a live grant for this exact site.',
    inputSchema: z.object({ siteId: siteIdSchema }).strict(),
    annotations: { readOnlyHint: true,destructiveHint: false,idempotentHint: true,openWorldHint: false },
  },({ siteId }) => result(() => getManagedSite(database,identity,siteId)))
  for (const action of ['pause','resume'] as const) server.registerTool(`${action}_site`,{
    description: action === 'pause' ? 'Pause this site CMS and invalidate its existing tickets/cookies. Requires the current site manager grant. Does not cancel production jobs.' :
      'Resume a paused site CMS. Staff must enter again from central; old cookies stay invalid. Requires the current site manager grant. Does not change the production-enabled setting.',
    inputSchema: lifecycleSchema,
    annotations: { readOnlyHint: false,destructiveHint: action === 'pause',idempotentHint: true,openWorldHint: false },
  },input => result(() => changeSiteLifecycle(database,identity,{ ...input,action })))
  return server
}

const rpcError = (status: number,code: number,message: string,headers: Record<string,string> = {}) => privateResponse(
  JSON.stringify({ jsonrpc: '2.0',id: null,error: { code,message } }),status,{ 'content-type': 'application/json',...headers },
)

async function readMessage(request: Request): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new Error('JSON required')
  const bytes = new Uint8Array(16384)
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      if (size+chunk.value.byteLength>bytes.length) { await reader.cancel(); throw new Error('Request too large') }
      bytes.set(chunk.value,size); size += chunk.value.byteLength
    }
    const value: unknown = JSON.parse(new TextDecoder('utf-8',{ fatal: true }).decode(bytes.subarray(0,size)))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('One JSON-RPC message required')
    return value
  } finally { reader.releaseLock() }
}

/** One server/transport/principal per HTTP request. No shared MCP sessions or
 * cookies, no fallback site and no cross-request mutable authentication state. */
export async function centralManagementMcp(request: Request, options: Options): Promise<Response> {
  const origin = requireCentralOrigin(options.centralOrigin), url = new URL(request.url)
  if (url.origin !== origin || url.pathname !== '/mcp' || url.search) return privateResponse('Not found',404)
  if (request.headers.has('origin') && request.headers.get('origin') !== origin) return rpcError(403,-32000,'Invalid origin')
  const authorization = request.headers.get('authorization') ?? ''
  if (authorization.length>8192 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)) {
    return rpcError(401,-32000,'Central Bearer login required',{ 'www-authenticate': 'Bearer realm="payload-site-control"' })
  }
  let identity: CentralIdentity | null
  try {
    // Payload must verify this supplied JWT. A valid browser cookie must never
    // rescue an invalid Bearer token or silently select another principal.
    identity = await options.authenticate(new Request(request.url,{ headers: { authorization } }))
    if (!identity || !await payloadSessionAuthority(options.database)(identity.userId,identity.sessionId)) {
      return rpcError(401,-32000,'Central Bearer login required',{ 'www-authenticate': 'Bearer realm="payload-site-control"' })
    }
  } catch { return rpcError(503,-32603,'Authentication unavailable') }
  // Stateless request/response mode does not offer a GET SSE subscription or a
  // DELETE session endpoint. The SDK client treats 405 on GET as supported.
  if (request.method !== 'POST') return rpcError(405,-32000,'Method not allowed',{ allow: 'POST' })
  let message: unknown
  try { message = await readMessage(request) } catch { return rpcError(400,-32700,'Invalid or oversized JSON-RPC message') }
  const server = createServer(options.database,identity)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined,enableJsonResponse: true })
  try {
    await server.connect(transport)
    const response = await transport.handleRequest(request,{ parsedBody: message })
    return privateResponse(response.body,response.status,response.headers)
  } catch { return rpcError(503,-32603,'MCP service unavailable') }
  finally { await server.close() }
}
