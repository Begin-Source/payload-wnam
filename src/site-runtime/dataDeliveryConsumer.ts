import { requireSiteDeliveryEnvironment, type SiteEnvironment } from '../application-roles/siteEnvironment'
import { canonicalMasterJSON } from '../site-control/masterSnapshot'
import { parseDataDeliveryQueueMessage, type DataDeliveryQueueMessage } from '../site-control/dataDeliveryQueue'
import type { MachineDataDelivery } from '../site-control/dataDeliveryJournal'
import type { MasterBundle, MasterReference } from '../site-control/masterSnapshot'
import type { ConfigBundle, ConfigReference } from '../site-control/configSnapshot'
import type { AssetReference, AssetTransfer } from '../site-control/assetSnapshot'
import { withSiteContext } from './context'
import { hasMasterCandidate, receiveMasterRelease } from './masterReceiver'
import { hasConfigCandidate, receiveConfigRelease } from './configReceiver'
import { hasAssetCandidate, receiveAssetCandidate } from './assetReceiver'

function sameDelivery(actual: MachineDataDelivery,message: DataDeliveryQueueMessage) {
  return actual.operationId === message.operationId && actual.siteId === message.siteId && actual.workerGroup === message.workerGroup &&
    actual.routingVersion === message.routingVersion && actual.kind === message.kind && actual.referenceDigest === message.referenceDigest &&
    canonicalMasterJSON(actual.reference) === canonicalMasterJSON(message.reference)
}

async function candidateExists(message: DataDeliveryQueueMessage,env: SiteEnvironment) {
  if (message.kind === 'master') return hasMasterCandidate(message.reference as MasterReference)
  if (message.kind === 'config') return hasConfigCandidate(message.reference as ConfigReference)
  return hasAssetCandidate(message.reference as AssetReference,{ publicBucket: env.SITE_PUBLIC,privateBucket: env.SITE_PRIVATE })
}

async function receive(delivery: MachineDataDelivery,env: SiteEnvironment) {
  if (delivery.kind === 'master') return receiveMasterRelease(delivery.reference as MasterReference,
    { readBundle: async () => delivery.value as MasterBundle })
  if (delivery.kind === 'config') return receiveConfigRelease(delivery.reference as ConfigReference,
    { readConfig: async () => delivery.value as ConfigBundle })
  return receiveAssetCandidate(delivery.reference as AssetReference,delivery.value as AssetTransfer,
    { publicBucket: env.SITE_PUBLIC,privateBucket: env.SITE_PRIVATE })
}

async function processDataDelivery(message: DataDeliveryQueueMessage,env: SiteEnvironment) {
  const selected = requireSiteDeliveryEnvironment(env),binding = selected.routes.find(route => route.siteId === message.siteId)
  if (!binding || message.workerGroup !== env.WORKER_GROUP) throw new Error('Delivery group unavailable')
  const host = `cms-site-${message.siteId}.beginos.org`
  const route = await env.ROUTING.resolve(message.siteId,host,env.WORKER_GROUP)
  if (!route || route.siteId !== binding.siteId || route.localSiteId !== binding.localSiteId || route.databaseId !== binding.databaseId ||
    route.bindingName !== binding.bindingName || route.schemaVersion !== binding.schemaVersion || route.adminHost !== host ||
    route.workerGroup !== env.WORKER_GROUP || route.routingVersion !== message.routingVersion ||
    !['active','provisioning'].includes(route.migrationState)) throw new Error('Delivery route unavailable')
  return withSiteContext({ siteId: binding.siteId,localSiteId: binding.localSiteId,
    binding: env[binding.bindingName as `SITE_D1_${string}`],requestHost: host,routingVersion: route.routingVersion,
    currentRoutingVersion: () => route.routingVersion,identity: null },async () => {
    let exists = await candidateExists(message,env)
    if (exists) {
      const completed = await env.DATA.acknowledgeDelivery!(message.operationId,message.capability,
        { receivedDigest: message.referenceDigest,receivedAt: new Date().toISOString() })
      if (completed.ok) return completed.value
    }
    const claimed = await env.DATA.readDelivery!(message.operationId,message.capability)
    if (!claimed.ok || !sameDelivery(claimed.value,message)) throw new Error('Delivery claim unavailable')
    if (!exists) {
      await receive(claimed.value,env)
      exists = await candidateExists(message,env)
    }
    if (!exists) throw new Error('Delivery candidate not durable')
    const acknowledged = await env.DATA.acknowledgeDelivery!(message.operationId,message.capability,
      { receivedDigest: message.referenceDigest,receivedAt: new Date().toISOString() })
    if (!acknowledged.ok || acknowledged.value.state !== 'succeeded') throw new Error('Delivery acknowledgement unavailable')
    return acknowledged.value
  })
}

export async function siteDataDeliveryQueue(batch: MessageBatch<unknown>,env: SiteEnvironment) {
  for (const message of batch.messages) {
    let parsed: DataDeliveryQueueMessage | null = null
    try {
      parsed = await parseDataDeliveryQueueMessage(message.body)
      await processDataDelivery(parsed,env)
      message.ack()
    } catch {
      if (parsed) {
        try { await env.DATA.failDelivery?.(parsed.operationId,parsed.capability,'site_receive_failed') } catch { /* bounded retry below */ }
      }
      message.retry({ delaySeconds: Math.min(300,30+message.attempts*30) })
    }
  }
}
