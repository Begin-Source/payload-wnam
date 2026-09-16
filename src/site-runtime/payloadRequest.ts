import type { PayloadRequest } from 'payload'
import { requireSiteContext } from './context'

// Payload's DataLoader keys omit siteId. Never share a request or its loader
// across scopes, even if the adapter would reject subsequent SQL: cached reads
// can return before reaching the adapter.
const owners = new WeakMap<object, object>()

export function assertSitePayloadRequest(req: Partial<PayloadRequest>): void {
  const { requestToken } = requireSiteContext()
  const resources: object[] = [req]
  if (req.payloadDataLoader) resources.push(req.payloadDataLoader)
  for (const resource of resources) {
    const owner = owners.get(resource)
    if (owner && owner !== requestToken) throw new Error('Cross-context Payload request/cache rejected')
  }
  for (const resource of resources) owners.set(resource, requestToken)
}
