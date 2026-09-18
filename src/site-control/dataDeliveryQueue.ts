import { z } from 'zod'
import { canonicalMasterJSON, masterDigest } from './masterSnapshot'
import { parseDataDeliveryInput, requestDataDelivery, type DataDeliveryInput, type DataDeliveryReference,
  type DataDeliverySummary } from './dataDeliveryJournal'
import type { CentralIdentity } from './siteLifecycle'

const capability = z.string().regex(/^[0-9a-f]{64}$/)
const digest = z.string().regex(/^[0-9a-f]{64}$/)
const messageSchema = z.object({
  type: z.literal('site.data.delivery'),
  operationId: z.string().uuid(),
  siteId: z.string().min(1).max(48),
  workerGroup: z.string().regex(/^[a-z0-9-]{1,64}$/),
  routingVersion: z.number().int().positive(),
  kind: z.enum(['master','config','asset']),
  reference: z.unknown(),
  referenceDigest: digest,
  capability,
}).strict()

export type DataDeliveryQueueMessage = {
  type: 'site.data.delivery'
  operationId: string
  siteId: string
  workerGroup: string
  routingVersion: number
  kind: DataDeliveryInput['kind']
  reference: DataDeliveryReference
  referenceDigest: string
  capability: string
}

export async function parseDataDeliveryQueueMessage(value: unknown): Promise<DataDeliveryQueueMessage> {
  const parsed = messageSchema.parse(value)
  const input = parseDataDeliveryInput({ operationId: parsed.operationId,siteId: parsed.siteId,
    routingVersion: parsed.routingVersion,kind: parsed.kind,reference: parsed.reference })
  const referenceDigest = await masterDigest(canonicalMasterJSON(input.reference))
  if (referenceDigest !== parsed.referenceDigest) throw new Error('Delivery queue reference mismatch')
  return { ...parsed,reference: input.reference }
}

/** The raw operation capability exists only in the encrypted Worker secret and
 * the target Queue message. Exact HTTP retries derive the same value without
 * persisting it in D1. */
export async function deriveDataDeliveryCapability(secret: string, operationId: string): Promise<string> {
  if (typeof secret !== 'string' || secret.length < 32 || !z.string().uuid().safeParse(operationId).success) {
    throw new Error('Delivery capability source unavailable')
  }
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{ name: 'HMAC',hash: 'SHA-256' },false,['sign'])
  const bytes = await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`site-data-delivery:${operationId}`))
  return Array.from(new Uint8Array(bytes),value => value.toString(16).padStart(2,'0')).join('')
}

export async function dataDeliveryQueueMessage(summary: DataDeliverySummary, rawCapability: string): Promise<DataDeliveryQueueMessage> {
  const value = { type: 'site.data.delivery' as const,operationId: summary.operationId,siteId: summary.siteId,
    workerGroup: summary.workerGroup,routingVersion: summary.routingVersion,kind: summary.kind,reference: summary.reference,
    referenceDigest: await masterDigest(canonicalMasterJSON(summary.reference)),capability: rawCapability }
  return parseDataDeliveryQueueMessage(value)
}

/** Journal before send. If Queue acceptance or its response is lost, the same
 * authenticated request recreates the same capability and sends an exact
 * duplicate; the journal and site receiver are both idempotent. */
export async function requestQueuedDataDelivery(database: D1Database, archive: R2Bucket, queue: Queue<DataDeliveryQueueMessage>,
  identity: CentralIdentity, value: unknown, secret: string): Promise<DataDeliverySummary & { replayed: boolean }> {
  const input = parseDataDeliveryInput(value)
  const rawCapability = await deriveDataDeliveryCapability(secret,input.operationId)
  const summary = await requestDataDelivery(database,archive,identity,input,rawCapability)
  const message = await dataDeliveryQueueMessage(summary,rawCapability)
  await queue.send(message,{ contentType: 'json' })
  return summary
}
