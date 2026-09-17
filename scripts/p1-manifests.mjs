import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
export const P1_ACCOUNT = 'd487cf34c606620b442632a72272014d'
export const P1_ZONE = '8d8fd673a6aeacf85360bc9e397d3002'
export const P1_ORIGIN = 'https://p1-hub.beginos.org'
export const P1_EMAIL = 'p1-isolation@example.invalid'
export function p1Manifests() {
  const central = JSON.parse(readFileSync('roles/central/wrangler.p1.jsonc','utf8'))
  const site = JSON.parse(readFileSync('roles/site/wrangler.p1.jsonc','utf8'))
  const expected = [
    { config: central,name: 'payload-wnam-p1-central',hosts: ['p1-hub.beginos.org'],
      dbs: [['CENTRAL_D1','payload-wnam-p1-central','c1e4ef96-e6ca-4457-93b3-55af5b572c0d']],
      r2: [['CENTRAL_MEDIA','payload-wnam-p1-central-media'],['MASTER_ASSET_ARCHIVE','payload-wnam-p1-master-archive']] },
    { config: site,name: 'payload-wnam-p1-sites',hosts: ['cms-site-p1-a.beginos.org','cms-site-p1-b.beginos.org','cms-site-p1-c.beginos.org'],
      dbs: [['SITE_D1_A','payload-wnam-p1-a','6daecf80-30f5-4010-add6-d67bb556cc42'],['SITE_D1_B','payload-wnam-p1-b','b2a1a340-681a-4581-8817-b2f9629a6ed4'],['SITE_D1_C','payload-p1-c-f8d779c312a4491cb36800f274be2bfd','02e8be38-7dfb-4c48-86e1-30e586961fc9']],
      r2: [['SITE_PUBLIC','payload-wnam-p1-site-public'],['SITE_PRIVATE','payload-wnam-p1-site-private']] },
  ]
  for (const target of expected) {
    const c = target.config
    assert.equal(c.account_id,P1_ACCOUNT); assert.equal(c.name,target.name)
    assert.equal(c.vars.CENTRAL_ORIGIN,P1_ORIGIN)
    assert.equal(c.workers_dev,false); assert.equal(c.preview_urls,false)
    assert.equal(c.compatibility_date,'2025-08-15')
    assert.deepEqual(c.compatibility_flags,['nodejs_compat','global_fetch_strictly_public'])
    assert.equal(c.main,'worker.ts'); assert.deepEqual(c.assets,{ directory: '.open-next/assets',binding: 'ASSETS' })
    assert.deepEqual(c.routes,target.hosts.map(pattern => ({ pattern,custom_domain: true })))
    assert.deepEqual(c.d1_databases,target.dbs.map(([binding,database_name,database_id]) => ({ binding,database_name,database_id })))
    assert.deepEqual(c.r2_buckets,target.r2.map(([binding,bucket_name]) => ({ binding,bucket_name })))
    assert.ok(!c.triggers && !c.queues && !c.env && !c.durable_objects)
  }
  assert.equal(site.vars.WORKER_GROUP,'p1-group-1')
  assert.deepEqual(site.services,[['IDENTITY','SiteIdentityService'],['DATA','SiteDataService'],['ROUTING','SiteRoutingService']]
    .map(([binding,entrypoint]) => ({ binding,entrypoint,service: central.name })))
  assert.deepEqual(JSON.parse(site.vars.SITE_ROUTES),site.d1_databases.map((db,index) => ({
    siteId: ['p1-a','p1-b','p1-c'][index],localSiteId: [37,82,103][index],bindingName: db.binding,databaseId: db.database_id,schemaVersion: 1,
  })))
  return { central,site }
}

/** Original immutable C plan used the two-site baseline. Never deploy this
 * historical manifest after the C binding has been installed. */
export function p1BaseManifests() {
  const { central,site } = p1Manifests()
  site.d1_databases = site.d1_databases.filter(db => db.binding !== 'SITE_D1_C')
  site.routes = site.routes.filter(route => route.pattern !== 'cms-site-p1-c.beginos.org')
  site.vars.SITE_ROUTES = JSON.stringify(JSON.parse(site.vars.SITE_ROUTES).filter(route => route.siteId !== 'p1-c'))
  return { central,site }
}
