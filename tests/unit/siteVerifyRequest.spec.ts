import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { describe,expect,it } from 'vitest'
import { verificationArguments } from '../../scripts/site-verify.mjs'
import { parseVerificationRequest } from '../../scripts/site-operations/verify-request'
import { runtimeProofSnapshot } from '../../scripts/site-operations/runtime-proof'
const fixture = () => {
  const provision = JSON.parse(readFileSync('operations/provision/p1-d.json','utf8'))
  return { operationId: randomUUID(),central: provision.central,centralWorkerTag: provision.centralWorkerTag,group: provision.baseline,
    workerTag: provision.plan.workerTag,zoneId: provision.zoneId,schemaDigest: provision.plan.schemaDigest,expectedDeploymentId: provision.plan.expectedDeploymentId,
    sites: [{ siteId: 'p1-c',ownership: { kind: 'provision',operationId: 'f8d779c3-12a4-491c-b368-00f274be2bfd' } }] }
}
describe('read-only verification request boundaries',() => {
  it('compares explicit RPC values without depending on proxy identity or enumeration',() => {
    const value = { siteId: 'p1-c',localSiteId: 103,bindingName: 'SITE_D1_C',databaseId: randomUUID(),schemaVersion: 1,
      workerGroup: 'p1-group-1',adminHost: 'cms-site-p1-c.beginos.org',routingVersion: 2,state: 'active' as const,tenantId: 1,
      releaseCommit: 'a'.repeat(40),releaseId: 'b'.repeat(64) }
    const remote = () => new Proxy({} as typeof value,{ get: (_target,key) => Reflect.get(value,key),ownKeys: () => [] })
    expect(runtimeProofSnapshot(remote())).toEqual(value)
    const before = runtimeProofSnapshot(remote()); value.routingVersion++
    expect(runtimeProofSnapshot(remote())).not.toEqual(before)
  })
  it('requires one explicit file and exposes no apply, force, SQL or credential option',() => {
    expect(verificationArguments(['--request','reviewed.json'])).toEqual({ request: 'reviewed.json' })
    for (const args of [[],['--request'],['--request','--force'],['--request','r.json','--apply'],['--sql','SELECT 1']]) expect(() => verificationArguments(args)).toThrow()
  })
  it('accepts current-manifest historical sites and rejects missing targets, foreign capabilities and legacy adoption',() => {
    expect(parseVerificationRequest(fixture()).sites[0].siteId).toBe('p1-c')
    for (const change of [
      (input: ReturnType<typeof fixture>) => { input.sites[0].siteId = 'p1-d' },
      (input: ReturnType<typeof fixture>) => { input.group.account_id = '0'.repeat(32) },
      (input: ReturnType<typeof fixture>) => { input.group.services[0].service = 'payload-wnam-foreign' },
      (input: ReturnType<typeof fixture>) => { input.group.vars.PAYLOAD_SECRET = 'forbidden' },
      (input: ReturnType<typeof fixture>) => { input.sites.push(input.sites[0]) },
    ]) { const input = fixture(); change(input); expect(() => parseVerificationRequest(input)).toThrow() }
    expect(() => parseVerificationRequest({ ...fixture(),sites: [{ siteId: 'p1-c',ownership: { kind: 'p1',role: 'site-a',operationId: 'p1-site-a-schema-v1' } }] })).toThrow('cannot adopt')
    expect(() => parseVerificationRequest({ ...fixture(),token: 'forbidden' })).toThrow()
  })
})
