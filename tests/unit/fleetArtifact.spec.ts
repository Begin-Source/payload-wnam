// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync,readFileSync,rmSync,writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe,expect,it } from 'vitest'
import { provisionDigest } from '../../src/site-control/provisionPlan'
import { loadProvisionFleet } from '../../scripts/provision-fleet-input.mjs'
import { parseProvisionRequest,provisionManifest } from '../../scripts/site-operations/manifest'
import { validateFleetReleaseArtifact } from '../../scripts/site-operations/fleet-artifact'

const commit = 'a'.repeat(40)
function fixture() {
  const reviewed = loadProvisionFleet('operations/fleet/p1.json')
  const c = JSON.parse(readFileSync('operations/provision/p1-c.json','utf8')),d = JSON.parse(readFileSync('operations/provision/p1-d.json','utf8'))
  const history = [{ request: c,databaseId: '02e8be38-7dfb-4c48-86e1-30e586961fc9' },{ request: d,databaseId: '40885d2c-87a7-4801-91cd-73f3d760c9f9' }]
  let manifest = provisionManifest(parseProvisionRequest(d),history[1].databaseId)
  for (const [index,siteId] of ['admitted-e','admitted-f'].entries()) {
    const request = { ...structuredClone(d),baseline: manifest,plan: { ...d.plan,operationId: randomUUID(),siteId,localSiteId: 105+index,
      name: `Synthetic ${siteId}`,bindingName: `SITE_D1_ADMITTED_${index}`,baselineManifestDigest: provisionDigest(JSON.stringify(manifest)) } }
    const databaseId = randomUUID()
    history.push({ request,databaseId }); manifest = provisionManifest(parseProvisionRequest(request),databaseId)
  }
  return { reviewed,artifact: { commit,operationId: reviewed.operationId,groups: [{ workerGroup: 'p1-group-1',manifest,
    manifestDigest: provisionDigest(JSON.stringify(manifest)),history }] } }
}
describe('complete fleet handoff between cloud release processes',() => {
  it('rederives all six site capabilities and verification ownership from C/D plus two admissions',() => {
    const { reviewed,artifact } = fixture(),resolved = validateFleetReleaseArtifact(artifact,reviewed,commit)
    expect(resolved.groups[0].manifest).toEqual(artifact.groups[0].manifest)
    expect(resolved.groups[0].verification.sites.map(site => site.siteId)).toEqual(['p1-a','p1-b','p1-c','p1-d','admitted-e','admitted-f'])
    expect(resolved.groups[0].latestRequest.plan.siteId).toBe('admitted-f')
  })
  it.each(['commit','selection','group','omit-reviewed','omit-admitted','reorder','reviewed-input','foreign-binding','central','worker','schema','credential','digest'])
    ('rejects %s changes to the cloud handoff',fault => {
      const { reviewed,artifact } = fixture(),group = artifact.groups[0]
      if (fault === 'commit') artifact.commit = 'b'.repeat(40)
      if (fault === 'selection') artifact.operationId = randomUUID()
      if (fault === 'group') group.workerGroup = 'unreviewed'
      if (fault === 'omit-reviewed') group.history.splice(0,1)
      if (fault === 'omit-admitted') group.history.pop()
      if (fault === 'reorder') group.history.reverse()
      if (fault === 'reviewed-input') group.history[0].request.plan.name = 'Changed reviewed request'
      if (fault === 'foreign-binding') group.manifest.d1_databases[0].database_id = randomUUID()
      if (fault === 'central') group.history[2].request.central.r2_buckets[0].bucket_name = 'foreign-bucket'
      if (fault === 'worker') group.history[2].request.plan.workerTag = '0'.repeat(32)
      if (fault === 'schema') group.history[2].request.plan.schemaVersion = 2
      if (fault === 'credential') group.history[2].request.token = 'fixture-only'
      if (fault === 'digest') group.manifestDigest = '0'.repeat(64)
      expect(() => validateFleetReleaseArtifact(artifact,reviewed,commit)).toThrow()
    })
  it('loads the same TypeScript validator from a plain Node subprocess used by cloud deploy and smoke',() => {
    const { reviewed,artifact } = fixture(),directory = mkdtempSync(join(tmpdir(),'fleet-artifact-')),path = join(directory,'artifact.json')
    try {
      writeFileSync(path,JSON.stringify(artifact))
      const code = `import { readFileSync } from 'node:fs';
        import { readFleetReleaseArtifact } from './scripts/p1-release-manifests.mjs';
        const input=JSON.parse(readFileSync(0,'utf8'));
        const result=await readFleetReleaseArtifact(input.path,input.reviewed,input.commit);
        console.log(JSON.stringify(result.groups.map(group=>group.verification.sites.map(site=>site.siteId))));`
      const output = execFileSync(process.execPath,['--input-type=module','-e',code],{ input: JSON.stringify({ path,reviewed,commit }),encoding: 'utf8',timeout: 20000 })
      expect(JSON.parse(output)).toEqual([['p1-a','p1-b','p1-c','p1-d','admitted-e','admitted-f']])
    } finally { rmSync(directory,{ recursive: true,force: true }) }
  },30000)
})
