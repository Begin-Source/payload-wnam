import { bindSiteCallback, withSiteContext } from './context'
import { createSiteD1Proxy } from './d1'
import { createSiteR2Proxy } from './r2'

export type P0Env = {
  SITE_ISOLATION_P0?: string
  SITE_D1_A?: D1Database
  SITE_D1_B?: D1Database
  P0_GATE_SECRET?: string
  R2: R2Bucket
}

const hosts = new Map([
  ['p0-a.beginos.org', { siteId: 'p0-a', binding: 'SITE_D1_A' as const }],
  ['p0-b.beginos.org', { siteId: 'p0-b', binding: 'SITE_D1_B' as const }],
])
const database = createSiteD1Proxy()
const cookieName = '__Host-p0-access'

async function matchesSecret(candidate: string, expected: string): Promise<boolean> {
  const digest = (value: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  const [a, b] = await Promise.all([digest(candidate), digest(expected)])
  const left = new Uint8Array(a), right = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i]
  return diff === 0
}

/** Temporary P0-only ingress: synthetic databases behind an independent test gate. */
export async function p0Fetch<E extends P0Env>(
  request: Request,
  env: E,
  ctx: ExecutionContext,
  next: (request: Request, env: E & { D1: D1Database }, ctx: ExecutionContext) => Promise<Response>,
): Promise<Response> {
  const url = new URL(request.url)
  const route = hosts.get(url.hostname)
  if (!route || url.protocol !== 'https:') return new Response('Unknown P0 host', { status: 421 })
  const binding = env[route.binding]
  if (!binding || !env.P0_GATE_SECRET || env.P0_GATE_SECRET.length < 32) {
    return new Response('P0 configuration unavailable', { status: 503 })
  }
  const bearer = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  const cookie = request.headers.get('cookie')?.split(';').map(v => v.trim())
    .find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? ''
  const session = url.pathname === '/__p0/session' && request.method === 'POST'
  if (!await matchesSecret(session ? bearer : cookie, env.P0_GATE_SECRET)) {
    return new Response('P0 access required', { status: 401, headers: { 'cache-control': 'no-store' } })
  }
  if (session) return new Response(null, {
    status: 204,
    headers: {
      'set-cookie': `${cookieName}=${env.P0_GATE_SECRET}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=3600`,
      'cache-control': 'no-store',
    },
  })

  return withSiteContext({
    siteId: route.siteId, binding, routingVersion: 1, currentRoutingVersion: () => 1,
    identity: null, // The gate grants test access, not a Payload user identity.
  }, async () => {
    const scopedEnv = { ...env, D1: database, R2: createSiteR2Proxy(env.R2) }
    const response = await next(request, scopedEnv, ctx)
    // OpenNext may produce the stream after fetch resolves, outside its ALS scope.
    const reader = response.body?.getReader()
    const body = reader ? new ReadableStream<Uint8Array>({
      pull: bindSiteCallback(async controller => {
        const result = await reader.read()
        if (result.done) controller.close()
        else controller.enqueue(result.value)
      }),
      cancel: bindSiteCallback(reason => reader.cancel(reason)),
    }) : null
    const headers = new Headers(response.headers)
    headers.set('cache-control', 'private, no-store')
    headers.set('x-robots-tag', 'noindex, nofollow')
    return new Response(body, { status: response.status, statusText: response.statusText, headers })
  })
}
