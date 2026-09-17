import type { inspectSiteRuntime } from '../../src/site-runtime/runtimeInspection'

type RuntimeProof = Awaited<ReturnType<typeof inspectSiteRuntime>>
/** getPlatformProxy returns RPC-backed objects. Copy the fixed primitive
 * contract before equality/serialization; object identity, ownKeys and custom
 * inspect symbols do not describe the remote record's values. */
export function runtimeProofSnapshot(value: RuntimeProof): RuntimeProof {
  return { siteId: value.siteId,localSiteId: value.localSiteId,bindingName: value.bindingName,databaseId: value.databaseId,
    schemaVersion: value.schemaVersion,workerGroup: value.workerGroup,adminHost: value.adminHost,routingVersion: value.routingVersion,
    state: value.state,tenantId: value.tenantId,releaseCommit: value.releaseCommit,releaseId: value.releaseId }
}
