import { readFileSync } from 'node:fs'
import { describe,expect,it } from 'vitest'
import { provisionArguments } from '../../scripts/site-provision.mjs'
import { parseProvisionRequest,provisionManifest } from '../../scripts/site-operations/manifest'
import { assertGroupSettings } from '../../scripts/site-operations/group'
import { provisionDigest } from '../../src/site-control/provisionPlan'

const source = () => JSON.parse(readFileSync('operations/provision/p1-c.json','utf8'))
describe('reviewed provision command boundaries',() => {
  it('requires an explicit mode and request, and rejects ambiguous or arbitrary options',() => {
    expect(provisionArguments(['--request','plan.json','--dry-run'])).toEqual({ request: 'plan.json',mode: 'dry-run' })
    expect(provisionArguments(['--apply','--request','plan.json'])).toEqual({ request: 'plan.json',mode: 'apply' })
    for (const args of [[],['--apply'],['--request','p.json'],['--request','p.json','--apply','--dry-run'],['--request','p.json','--apply','--request','q.json'],['--apply','--request','--force'],['--apply','--request','p.json','--token','secret']]) {
      expect(() => provisionArguments(args)).toThrow()
    }
  })
  it('adds one reviewed site while preserving all prior bindings and the immutable C manifest digest',() => {
    const request = parseProvisionRequest(source()),before = structuredClone(request.baseline)
    const manifest = provisionManifest(request,'02e8be38-7dfb-4c48-86e1-30e586961fc9')
    expect(manifest).toEqual(JSON.parse(readFileSync('roles/site/wrangler.p1.jsonc','utf8')))
    expect(provisionDigest(JSON.stringify(manifest))).toBe('34873e43930b78d20bfff67d22c6972a77ec832236632a7226f863023ee791b0')
    expect(request.baseline).toEqual(before)
    expect(() => provisionManifest(request,before.d1_databases[0].database_id)).toThrow('already bound')
  })
  it('rejects credential fields, implicit resources, changed baselines, foreign accounts and mismatched service targets',() => {
    const mutations = [
      (input: ReturnType<typeof source>) => { input.token = 'not-a-real-token' },
      (input: ReturnType<typeof source>) => { input.baseline.vars.PAYLOAD_SECRET = 'not-a-real-secret' },
      (input: ReturnType<typeof source>) => { delete input.baseline.d1_databases[0].database_id },
      (input: ReturnType<typeof source>) => { input.plan.accountId = '0'.repeat(32) },
      (input: ReturnType<typeof source>) => { input.baseline.vars.WORKER_GROUP = 'another-group' },
      (input: ReturnType<typeof source>) => { input.baseline.services[0].service = 'payload-wnam-foreign' },
      (input: ReturnType<typeof source>) => { input.plan.baselineManifestDigest = '0'.repeat(64) },
    ]
    for (const mutate of mutations) { const input = source(); mutate(input); expect(() => parseProvisionRequest(input)).toThrow() }
  })
  it('rejects extra, missing and mismatched deployed capabilities without inspecting secret values',() => {
    const { baseline } = parseProvisionRequest(source())
    const settings = { compatibility_date: baseline.compatibility_date,compatibility_flags: baseline.compatibility_flags,bindings: [
      { name: 'ASSETS',type: 'assets' },{ name: 'PAYLOAD_SECRET',type: 'secret_text' },
      ...baseline.d1_databases.map(db => ({ name: db.binding,type: 'd1',id: db.database_id })),
      ...baseline.r2_buckets.map(bucket => ({ name: bucket.binding,type: 'r2_bucket',bucket_name: bucket.bucket_name })),
      ...baseline.services.map(service => ({ name: service.binding,type: 'service',service: service.service,entrypoint: service.entrypoint })),
      ...Object.entries(baseline.vars).map(([name,text]) => ({ name,type: 'plain_text',text })),
    ] }
    expect(() => assertGroupSettings(settings,baseline)).not.toThrow()
    expect(() => assertGroupSettings({ ...settings,bindings: [...settings.bindings,{ name: 'UNREVIEWED',type: 'service' }] },baseline)).toThrow()
    expect(() => assertGroupSettings({ ...settings,bindings: settings.bindings.filter(b => b.name !== 'SITE_D1_A') },baseline)).toThrow()
    expect(() => assertGroupSettings({ ...settings,bindings: settings.bindings.map(b => b.name === 'IDENTITY' ? { ...b,environment: 'foreign' } : b) },baseline)).toThrow()
    expect(() => assertGroupSettings({ ...settings,bindings: [...settings.bindings,{ name: 'PROVISION_OPERATION',type: 'plain_text',text: 'incomplete' }] },baseline)).toThrow('Incomplete group provenance')
  })
})
