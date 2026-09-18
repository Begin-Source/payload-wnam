import { requireCentralOrigin } from '../site-control/sessionHttp'
import type { ProvisionDispatchEnvironment,ProvisionQueueMessage } from '../site-control/provisionDispatch'
export type CentralEnvironment = {
  CENTRAL_D1: D1Database
  CENTRAL_MEDIA: R2Bucket
  MASTER_ASSET_ARCHIVE: R2Bucket
  CENTRAL_ORIGIN: string
  PAYLOAD_SECRET: string
  PROVISION_DISPATCH_QUEUE?: Queue<ProvisionQueueMessage>
  PROVISION_DEPLOY_HOOK_URL?: string
  PROVISION_BUILD_ACCOUNT_ID?: string
  PROVISION_BUILD_EVENT_SUBSCRIPTION_ID?: string
  PROVISION_BUILD_WORKER?: string
  PROVISION_BUILD_BRANCH?: string
  PROVISION_BUILD_REPOSITORY?: string
  PROVISION_BUILD_REPOSITORY_OWNER?: string
}

/** Runtime has no default D1, process-secret or legacy storage fallback. */
export function requireCentralEnvironment(value: unknown): CentralEnvironment {
  const env = value as Partial<CentralEnvironment> | undefined
  if (!env || typeof env.CENTRAL_D1?.prepare !== 'function' ||
    typeof env.CENTRAL_MEDIA?.get !== 'function' || typeof env.CENTRAL_MEDIA?.put !== 'function' ||
    typeof env.MASTER_ASSET_ARCHIVE?.get !== 'function' || env.CENTRAL_MEDIA === env.MASTER_ASSET_ARCHIVE ||
    typeof env.PAYLOAD_SECRET !== 'string' || env.PAYLOAD_SECRET.length < 32) {
    throw new Error('Central role bindings unavailable')
  }
  requireCentralOrigin(env.CENTRAL_ORIGIN)
  return env as CentralEnvironment
}

export function requireProvisionDispatchEnvironment(value: unknown): CentralEnvironment & ProvisionDispatchEnvironment {
  const env = requireCentralEnvironment(value)
  if (typeof env.PROVISION_DISPATCH_QUEUE?.send !== 'function' ||
    typeof env.PROVISION_DEPLOY_HOOK_URL !== 'string' || env.PROVISION_DEPLOY_HOOK_URL.length < 40 ||
    !/^[a-f0-9]{32}$/.test(env.PROVISION_BUILD_ACCOUNT_ID ?? '') ||
    typeof env.PROVISION_BUILD_EVENT_SUBSCRIPTION_ID !== 'string' || env.PROVISION_BUILD_EVENT_SUBSCRIPTION_ID.length < 8 ||
    !env.PROVISION_BUILD_WORKER || !env.PROVISION_BUILD_BRANCH || !env.PROVISION_BUILD_REPOSITORY ||
    !env.PROVISION_BUILD_REPOSITORY_OWNER) throw new Error('Provision dispatch bindings unavailable')
  return env as CentralEnvironment & ProvisionDispatchEnvironment
}
