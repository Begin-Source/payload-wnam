import { readFileSync } from 'node:fs'
import { describe,expect,it } from 'vitest'
import { provisionDigest } from '../../src/site-control/provisionPlan'
import { admissionGroupInspector } from '../../scripts/site-operations/admission-inspect'
import { ProvisionCloudflare } from '../../scripts/site-operations/cloudflare'
import { parseProvisionRequest,provisionManifest } from '../../scripts/site-operations/manifest'

function fixture(fault = '') {
  const latestRequest = parseProvisionRequest(JSON.parse(readFileSync('operations/provision/p1-d.json','utf8')))
  const manifest = provisionManifest(latestRequest,'40885d2c-87a7-4801-91cd-73f3d760c9f9')
  const manifestDigest = provisionDigest(JSON.stringify(manifest)),{ central,plan,zoneId } = latestRequest
  const deploymentId = 'b88d798e-6080-460d-affc-ab85dc5301d3',requests: string[] = []
  let deploymentReads = 0
  const settings = { compatibility_date: manifest.compatibility_date,compatibility_flags: manifest.compatibility_flags,bindings: [
    { name: 'ASSETS',type: 'assets' },{ name: 'PAYLOAD_SECRET',type: 'secret_text' },
    ...manifest.d1_databases.map(db => ({ name: db.binding,type: 'd1',id: fault === 'last-binding' && db.binding === plan.bindingName ? central.d1_databases[0].database_id : db.database_id })),
    ...manifest.r2_buckets.map(bucket => ({ name: bucket.binding,type: 'r2_bucket',bucket_name: bucket.bucket_name })),
    ...manifest.services.map(service => ({ name: service.binding,type: 'service',service: service.service,entrypoint: service.entrypoint })),
    ...Object.entries(manifest.vars).map(([name,text]) => ({ name,type: 'plain_text',text })),
    ...Object.entries({ PROVISION_OPERATION: plan.operationId,PROVISION_MANIFEST: manifestDigest,PROVISION_COMMIT: 'a'.repeat(40),RELEASE_OPERATION: 'b'.repeat(64) })
      .map(([name,text]) => ({ name,type: 'plain_text',text })),
  ] }
  const api = new ProvisionCloudflare(plan.accountId,'fixture-only',{ fetch: async (input,init) => {
    expect(init?.method).toBe('GET')
    const url = new URL(String(input)),prefix = `/client/v4/accounts/${plan.accountId}/`
    requests.push(url.pathname)
    let result: unknown
    if (url.pathname === `/client/v4/zones/${zoneId}`) result = { id: zoneId,name: 'beginos.org',account: { id: fault === 'account' ? '0'.repeat(32) : plan.accountId } }
    else {
      expect(url.pathname.startsWith(prefix)).toBe(true)
      const path = url.pathname.slice(prefix.length)
      if (path === `workers/scripts/${manifest.name}/deployments`) {
        deploymentReads++
        result = { deployments: [{ id: fault === 'concurrent-upload' && deploymentReads > 3 ? plan.expectedDeploymentId : deploymentId,
          versions: [{ version_id: 'c9b5e663-61f5-426b-908e-13e6a4266fd2',percentage: fault === 'split-deployment' ? 50 : 100 }] }] }
      } else if (path === `workers/scripts/${manifest.name}/settings`) result = settings
      else if (path === `workers/scripts/${central.name}/settings`) result = { bindings: [
        { name: 'CENTRAL_D1',type: 'd1',id: plan.centralDatabaseId },{ name: 'CENTRAL_ORIGIN',type: 'plain_text',text: plan.centralOrigin },
        ...central.r2_buckets.map(bucket => ({ name: bucket.binding,type: 'r2_bucket',bucket_name: bucket.bucket_name })),
      ] }
      else if (path.endsWith('/subdomain')) result = { enabled: fault === 'central-public' && path.includes(central.name),previews_enabled: false }
      else if (path === 'workers/scripts') result = [{ id: manifest.name,tag: fault === 'worker-owner' ? '0'.repeat(32) : plan.workerTag },{ id: central.name,tag: latestRequest.centralWorkerTag }]
      else if (path === 'workers/domains') result = [central,manifest].flatMap(config => config.routes.map(route => ({ hostname: route.pattern,
        service: fault === 'last-domain' && route.pattern === plan.adminHost ? central.name : config.name,zone_id: zoneId })))
      else if (path.startsWith('d1/database/')) {
        const db = [...central.d1_databases,...manifest.d1_databases].find(db => path.endsWith(db.database_id))!
        result = { uuid: db.database_id,name: fault === 'last-database' && db.binding === plan.bindingName ? 'foreign' : db.database_name,
          created_at: '2026-09-17T00:00:00Z',read_replication: { mode: fault === 'replication' && db.binding === plan.bindingName ? 'auto' : 'disabled' } }
      } else if (path.startsWith('r2/buckets/')) {
        const name = path.split('/')[2]
        result = path.endsWith('/managed') ? { enabled: fault === 'bucket-public' } : path.endsWith('/custom') ? { domains: [] } : { name,location: 'WNAM' }
      } else throw new Error(`Unexpected inspection API path: ${path}`)
    }
    return Response.json({ success: true,result })
  } })
  return { api,group: { latestRequest,manifest,manifestDigest },deploymentId,requests }
}
describe('Cloudflare admission resource inspection',() => {
  it('reads all four current D1 identities including the newest completed admission, without mutations',async () => {
    const { api,group,deploymentId,requests } = fixture()
    expect(await admissionGroupInspector(api)(group)).toEqual({ deploymentId,manifestDigest: group.manifestDigest })
    for (const db of [...group.latestRequest.central.d1_databases,...group.manifest.d1_databases])
      expect(requests).toContain(`/client/v4/accounts/${api.accountId}/d1/database/${db.database_id}`)
    expect(group.manifest.d1_databases).toHaveLength(4)
  })
  it.each(['last-database','last-binding','last-domain','replication','account','worker-owner','bucket-public','central-public','concurrent-upload','split-deployment'])
    ('rejects %s before returning a planning baseline',async fault => {
      const { api,group } = fixture(fault)
      await expect(admissionGroupInspector(api)(group)).rejects.toThrow()
    })
  it('rejects a manifest with a recomputed digest that silently drops a historical member',async () => {
    const { api,group } = fixture()
    group.manifest.d1_databases.shift()
    group.manifestDigest = provisionDigest(JSON.stringify(group.manifest))
    await expect(admissionGroupInspector(api)(group)).rejects.toThrow()
  })
})
