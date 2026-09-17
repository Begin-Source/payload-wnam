import { createHash } from 'node:crypto'
import { z } from 'zod'
import { requireCentralOrigin } from './sessionHttp'

const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
export const provisionDigest = (value: string) => createHash('sha256').update(value).digest('hex')
export const provisionHashSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const provisionUuidSchema = z.string().uuid().toLowerCase()
const inputSchema = z.object({
  operationId: provisionUuidSchema,
  accountId: z.literal('d487cf34c606620b442632a72272014d'),
  centralDatabaseId: provisionUuidSchema,
  centralOrigin: z.string(),
  siteId: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/),
  localSiteId: positive,
  name: z.string().trim().min(1).max(120),
  tenantId: positive,
  ownerUserId: positive,
  workerGroup: z.string().regex(/^[a-z0-9-]{1,64}$/),
  workerName: z.string().regex(/^payload-wnam-[a-z0-9-]{1,48}$/),
  workerTag: z.string().regex(/^[a-f0-9]{32}$/),
  expectedDeploymentId: provisionUuidSchema,
  baselineManifestDigest: provisionHashSchema,
  bindingName: z.string().regex(/^SITE_D1_[A-Z0-9_]{1,48}$/),
  schemaVersion: positive,
  schemaDigest: provisionHashSchema,
  timezone: z.string().min(1).max(64),
}).strict()

export type ProvisionInput = z.input<typeof inputSchema>
export type ProvisionPlan = Readonly<z.output<typeof inputSchema> & {
  adminHost: string; databaseName: string; productionEnabled: false; readReplication: 'disabled'; locationHint: 'wnam'
}>

/** Explicit reviewed inputs only: no inferred account, default site, password,
 * provider token, resource-ID override or unreviewed production enablement. */
export function provisionPlan(input: unknown): ProvisionPlan {
  const parsed = inputSchema.parse(input)
  requireCentralOrigin(parsed.centralOrigin)
  new Intl.DateTimeFormat('en',{ timeZone: parsed.timezone })
  return Object.freeze({ ...parsed,adminHost: `cms-site-${parsed.siteId}.beginos.org`,
    databaseName: `payload-${parsed.siteId.slice(0,16)}-${parsed.operationId.replaceAll('-','')}`,
    productionEnabled: false,readReplication: 'disabled',locationHint: 'wnam' })
}

export function serializeProvisionPlan(plan: ProvisionPlan): string {
  const { adminHost: _host,databaseName: _database,productionEnabled: _enabled,readReplication: _replication,locationHint: _location,...input } = plan
  const canonical = provisionPlan(input)
  if (canonical.adminHost !== plan.adminHost || canonical.databaseName !== plan.databaseName || plan.productionEnabled !== false ||
    plan.readReplication !== 'disabled' || plan.locationHint !== 'wnam') throw new Error('Provision plan derived fields changed')
  return JSON.stringify(canonical)
}
