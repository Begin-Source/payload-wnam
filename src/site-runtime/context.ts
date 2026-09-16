import { AsyncLocalStorage } from 'node:async_hooks'

export type SiteIdentity = Readonly<{ userId: string; sessionId: string }>
export type SiteContext = Readonly<{
  siteId: string
  binding: D1Database
  routingVersion: number
  identity: SiteIdentity | null
  /** Consult trusted routing state, never a client-supplied header. */
  currentRoutingVersion: () => number
}>

type Scope = SiteContext & { readonly requestToken: object }
type Runtime = Readonly<{
  storage: AsyncLocalStorage<Scope>
  resourceOwners: WeakMap<object, object>
}>
// OpenNext and the outer Worker may bundle this module separately. Share only
// the immutable ALS container, never a mutable "current database" binding.
const key = Symbol.for('payload-wnam.site-runtime.v1')
const runtimeGlobal = globalThis as typeof globalThis & { [key]?: Runtime }
if (!runtimeGlobal[key]) {
  Object.defineProperty(runtimeGlobal, key, {
    value: Object.freeze({ storage: new AsyncLocalStorage<Scope>(), resourceOwners: new WeakMap<object, object>() }),
    writable: false,
    configurable: false,
  })
}
const { storage, resourceOwners } = runtimeGlobal[key]!

export function requireSiteContext(): Scope {
  const context = storage.getStore()
  if (!context) throw new Error('Site database context required')
  if (context.currentRoutingVersion() !== context.routingVersion) {
    throw new Error('Stale site routing version')
  }
  return context
}

/** Only trusted ingress/queue routing may establish this scope. */
export function withSiteContext<T>(context: SiteContext, callback: () => T): T {
  if (!context.siteId || !Number.isSafeInteger(context.routingVersion) || context.routingVersion < 1) {
    throw new Error('Invalid site context')
  }
  if (!context.binding || typeof context.binding.prepare !== 'function') {
    throw new Error('Site database binding required')
  }
  const scope: Scope = Object.freeze({
    ...context,
    identity: context.identity ? Object.freeze({ ...context.identity }) : null,
    requestToken: Object.freeze({}),
  })
  return storage.run(scope, () => {
    requireSiteContext()
    return callback()
  })
}

/** Streams and callbacks invoked by another async resource need an explicit snapshot. */
export function bindSiteCallback<A extends unknown[], T>(callback: (...args: A) => T): (...args: A) => T {
  const context = requireSiteContext()
  return (...args) => storage.run(context, () => {
    requireSiteContext()
    return callback(...args)
  })
}

export function claimSiteRequestResources(resources: object[]): void {
  const { requestToken } = requireSiteContext()
  for (const resource of resources) {
    const owner = resourceOwners.get(resource)
    if (owner && owner !== requestToken) throw new Error('Cross-context Payload request/cache rejected')
  }
  for (const resource of resources) resourceOwners.set(resource, requestToken)
}
