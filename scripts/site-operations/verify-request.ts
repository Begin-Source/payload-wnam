import assert from 'node:assert/strict'
import { z } from 'zod'
import { provisionHashSchema,provisionUuidSchema } from '../../src/site-control/provisionPlan'
import { centralConfig,siteConfig,groupRoutes } from './manifest'

export const verificationTarget = z.object({ siteId: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/),
  ownership: z.discriminatedUnion('kind',[
    z.object({ kind: z.literal('provision'),operationId: provisionUuidSchema }).strict(),
    z.object({ kind: z.literal('p1'),operationId: z.string().regex(/^p1-site-[ab]-schema-v[1-9][0-9]*$/),role: z.enum(['site-a','site-b']) }).strict(),
  ]) }).strict()
const requestSchema = z.object({ operationId: provisionUuidSchema,central: centralConfig,centralWorkerTag: z.string().regex(/^[a-f0-9]{32}$/),
  group: siteConfig,workerTag: z.string().regex(/^[a-f0-9]{32}$/),zoneId: z.literal('8d8fd673a6aeacf85360bc9e397d3002'),
  schemaDigest: provisionHashSchema,expectedDeploymentId: provisionUuidSchema,sites: z.array(verificationTarget).min(1).max(50) }).strict()
export function parseVerificationRequest(input: unknown) {
  const request = requestSchema.parse(input),{ central,group,sites } = request
  assert.equal(group.account_id,central.account_id)
  assert.equal(group.vars.CENTRAL_ORIGIN,central.vars.CENTRAL_ORIGIN)
  assert.deepEqual(central.routes,[{ pattern: new URL(central.vars.CENTRAL_ORIGIN).hostname,custom_domain: true }])
  assert.deepEqual(central.d1_databases.map(db => db.binding),['CENTRAL_D1'])
  assert.deepEqual(central.r2_buckets.map(bucket => bucket.binding).sort(),['CENTRAL_MEDIA','MASTER_ASSET_ARCHIVE'])
  assert.deepEqual(group.r2_buckets.map(bucket => bucket.binding).sort(),['SITE_PRIVATE','SITE_PUBLIC'])
  assert.equal(new Set([...central.r2_buckets,...group.r2_buckets].map(bucket => bucket.bucket_name)).size,4)
  assert.deepEqual(group.services,[['IDENTITY','SiteIdentityService'],['DATA','SiteDataService'],['ROUTING','SiteRoutingService']]
    .map(([binding,entrypoint]) => ({ binding,entrypoint,service: central.name })))
  const routes = groupRoutes(group)
  assert.equal(new Set(sites.map(site => site.siteId)).size,sites.length,'Duplicate verification target')
  for (const site of sites) {
    assert.ok(routes.some(route => route.siteId === site.siteId),'Verification site absent from current group')
    if (site.ownership.kind === 'p1') {
      assert.equal(site.siteId,`p1-${site.ownership.role.slice(-1)}`,'P1 legacy ownership cannot adopt another site')
      assert.equal(site.ownership.operationId,`p1-${site.ownership.role}-schema-v1`)
    }
  }
  return request
}
