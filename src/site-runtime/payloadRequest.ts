import type { PayloadRequest } from 'payload'
import { claimSiteRequestResources } from './context'

// Payload's DataLoader keys omit siteId. Never share a request or its loader
// across scopes, even if the adapter would reject subsequent SQL: cached reads
// can return before reaching the adapter.
export function assertSitePayloadRequest(req: Partial<PayloadRequest>): void {
  const resources: object[] = [req]
  if (req.payloadDataLoader) resources.push(req.payloadDataLoader)
  claimSiteRequestResources(resources)
}
