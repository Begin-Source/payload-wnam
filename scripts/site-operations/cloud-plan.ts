import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { getPlatformProxy } from 'wrangler'
import { provisionDigest,provisionUuidSchema } from '../../src/site-control/provisionPlan'
import { loadProvisionFleet } from '../provision-fleet-input.mjs'
import { roleSchemaDigest,type RoleSchema } from '../p1-schema'
import { planProvisionAdmission } from './admission-plan'
import { admissionGroupInspector } from './admission-inspect'
import { ProvisionCloudflare } from './cloudflare'
import { parseProvisionFleet } from './fleet'
import { parseProvisionRequest } from './manifest'
import { validateProvisionSchema } from './schema'
import { workersCiCommit } from '../workers-ci-identity.mjs'

assert.equal(process.env.WORKERS_CI,'1')
assert.ok(['feat/site-per-d1','main'].includes(process.env.WORKERS_CI_BRANCH ?? ''))
const commit = execFileSync('git',['rev-parse','HEAD'],{ encoding: 'utf8' }).trim()
assert.equal(workersCiCommit(),commit)
assert.equal(JSON.parse(readFileSync('.cloudflare-ci/release.json','utf8')).commit,commit)
assert.equal(process.env.WRANGLER_CI_OVERRIDE_NAME,undefined)
assert.equal(process.env.WRANGLER_CI_MATCH_TAG,undefined)
const selection = z.object({ requestId: provisionUuidSchema,workerGroup: z.string().regex(/^[a-z0-9-]{1,64}$/),
  fleetPath: z.string().regex(/^operations\/fleet\/[a-z0-9-]+\.json$/),mode: z.enum(['dry-run','prepare']) }).strict()
  .parse(JSON.parse(process.env.SITE_ADMISSION_SELECTION ?? 'null'))
const fleetInput = loadProvisionFleet(selection.fleetPath)
const reviewed = parseProvisionFleet(fleetInput).groups.find(group => group.workerGroup === selection.workerGroup)
assert.ok(reviewed,'Explicit group is absent from reviewed fleet')
const first = parseProvisionRequest(reviewed.requests[0]),{ plan,central,baseline } = first
assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID,plan.accountId)
const schema = JSON.parse(readFileSync('.cloudflare-ci/role-site-a-schema.json','utf8')) as RoleSchema
validateProvisionSchema(plan,schema)
assert.ok(existsSync('.cloudflare-ci/roles/site/.open-next/worker.js'),'Checked site role artifact required')
const api = new ProvisionCloudflare(plan.accountId,process.env.CLOUDFLARE_API_TOKEN ?? '')
// Verify central ownership before opening even the maintenance read capability.
const zone = await api.zone(first.zoneId)
assert.equal(zone.id,first.zoneId); assert.equal(zone.account.id,plan.accountId); assert.equal(zone.name,'beginos.org')
const workers = (await api.request<{ id: string; tag: string }[]>('workers/scripts')).result
assert.equal(workers.find(worker => worker.id === central.name)?.tag,first.centralWorkerTag)
assert.equal((await api.database(plan.centralDatabaseId)).name,central.d1_databases[0].database_name)
const settings = (await api.request<{ bindings: { name: string; type: string; id?: string; text?: string }[] }>(`workers/scripts/${central.name}/settings`)).result
assert.ok(settings.bindings.some(binding => binding.name === 'CENTRAL_D1' && binding.type === 'd1' && binding.id === plan.centralDatabaseId))
assert.equal(settings.bindings.find(binding => binding.name === 'CENTRAL_ORIGIN')?.text,plan.centralOrigin)
const directory = resolve('.cloudflare-ci/admission',selection.requestId)
mkdirSync(directory,{ recursive: true })
const configPath = resolve(directory,'central.json')
writeFileSync(configPath,JSON.stringify({ name: 'payload-wnam-admission-maintenance',account_id: plan.accountId,
  compatibility_date: baseline.compatibility_date,compatibility_flags: baseline.compatibility_flags,
  d1_databases: central.d1_databases.map(database => ({ ...database,remote: true })) }))
const proxy = await getPlatformProxy<{ CENTRAL_D1: D1Database }>({ configPath,remoteBindings: true,persist: false })
try {
  const result = await planProvisionAdmission(selection.requestId,selection.workerGroup,{ database: proxy.env.CENTRAL_D1,fleetInput,
    schema: { version: plan.schemaVersion,digest: roleSchemaDigest(schema.objects) },inspect: admissionGroupInspector(api) },selection.mode)
  const requestPath = resolve(directory,selection.mode === 'prepare' ? 'request.json' : 'preview-request.json')
  writeFileSync(requestPath,JSON.stringify(result.raw,null,2))
  const report = { event: 'site_admission_planned',commit,checkedAt: new Date().toISOString(),...selection,
    accountId: plan.accountId,centralDatabaseId: plan.centralDatabaseId,reused: result.reused,mutations: result.mutations,
    infrastructureMutations: false,baselineSites: result.request.baseline.d1_databases.length,
    expectedDeploymentId: result.request.plan.expectedDeploymentId,requestDigest: provisionDigest(JSON.stringify(result.raw)),requestPath }
  writeFileSync(resolve(directory,`${selection.mode}.json`),JSON.stringify(report,null,2))
  console.log(JSON.stringify(report))
} finally { await proxy.dispose() }
process.exit(0)
