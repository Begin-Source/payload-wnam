import { cache } from 'react'
import { optionalSiteContext } from './context'

/** React's request cache must also distinguish nested site scopes and routing versions. */
// Preserve the function's own inference for optional/defaulted arguments, like React.cache.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cacheForSite<Fn extends (...args: any[]) => any>(fn: Fn): Fn {
  const cached = cache((_siteId: string, _version: number, _requestToken: object | undefined, ...args: Parameters<Fn>): ReturnType<Fn> => fn(...args))
  return ((...args: Parameters<Fn>) => {
    const scope = optionalSiteContext()
    return cached(scope?.siteId ?? '', scope?.routingVersion ?? 0, scope?.requestToken, ...args)
  }) as Fn
}
