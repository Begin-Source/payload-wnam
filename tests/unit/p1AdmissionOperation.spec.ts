import { describe,expect,it } from 'vitest'
import { validateP1AdmissionSelection } from '../../scripts/p1-admission-selection.mjs'
import { validateReleaseSelection } from '../../scripts/p1-release-manifests.mjs'
import { runtimeSourceDigest } from '../../scripts/p1-runtime-source.mjs'

const value = () => ({ request: { requestId: '91c2c4f0-fc5b-41c2-9b72-58c6dca303c0',siteId: 'p1-e',name: 'P1 Site E',
  tenantId: 1,ownerUserId: 7,timezone: 'Europe/Berlin' },workerGroup: 'p1-group-1',fleetPath: 'operations/fleet/p1.json',
  centralDeploymentId: '5e2eafa3-b8b6-49f2-b7bb-1e716f6f09bb',centralCommit: 'a'.repeat(40),sourceDigest: 'b'.repeat(64) })
const entry = (path: string,hash = 'a'.repeat(40)) => `100644 blob ${hash}\t${path}`
describe('reviewed P1 admission-only cloud operation',() => {
  it('selects one synthetic request with pinned central identity and unchanged runtime',() => {
    expect(validateP1AdmissionSelection(value(),'b'.repeat(64))).toEqual(value())
    const selection = { provisionRequest: 'operations/provision/p1-d.json',admission: value() }
    expect(validateReleaseSelection(selection,'b'.repeat(64))).toEqual(selection)
    expect(() => validateReleaseSelection({ ...selection,reconcile: {} },'b'.repeat(64))).toThrow()
    expect(() => validateP1AdmissionSelection(value(),'c'.repeat(64))).toThrow('changed runtime')
  })
  it('rejects implicit identities, human accounts, foreign groups and injected capabilities',() => {
    const changes = [
      (v: ReturnType<typeof value>) => { v.request.ownerUserId = 8 },
      (v: ReturnType<typeof value>) => { v.request.tenantId = 3 },
      (v: ReturnType<typeof value>) => { v.request.siteId = 'p1-a' },
      (v: ReturnType<typeof value>) => { v.request.requestId = '../foreign' },
      (v: ReturnType<typeof value>) => { v.request.timezone = 'Invalid/Zone' },
      (v: ReturnType<typeof value>) => { v.fleetPath = '../foreign.json' },
      (v: ReturnType<typeof value>) => { v.workerGroup = 'foreign' },
      (v: ReturnType<typeof value>) => { v.centralDeploymentId = '' },
      (v: ReturnType<typeof value>) => { v.centralCommit = '' },
    ]
    for (const change of changes) { const v = value(); change(v); expect(() => validateP1AdmissionSelection(v,'b'.repeat(64))).toThrow() }
    for (const v of [null,[],{ ...value(),token: 'forbidden' },{ ...value(),request: { ...value().request,databaseId: 'forbidden' } }])
      expect(() => validateP1AdmissionSelection(v,'b'.repeat(64))).toThrow()
  })
  it('keeps application, dependencies, schema, role build and source ownership inputs fingerprinted',() => {
    for (const path of ['src/site-control/provisionAdmission.ts','src/site-control/config.ts','roles/central/worker.ts',
      'roles/site/worker.ts','package.json','pnpm-lock.yaml','scripts/ci-build.mjs','scripts/p1-bootstrap.ts',
      'scripts/site-operations/manifest.ts','operations/provision/p1-d.json','operations/fleet/p1.json']) {
      expect(runtimeSourceDigest(entry(path),'admission')).not.toBe(runtimeSourceDigest(entry(path,'b'.repeat(40)),'admission'))
      expect(runtimeSourceDigest(entry(path),'admission')).not.toBe(runtimeSourceDigest('','admission'))
    }
    expect(() => runtimeSourceDigest('','unknown')).toThrow('Unknown runtime source policy')
  })
  it('allows only named cloud admission maintenance changes without widening ordinary recovery',() => {
    const runtime = entry('src/app/page.tsx')
    for (const path of ['scripts/p1-admission-selection.mjs','scripts/ci-p1-admission.mjs','scripts/ci-p1-admission-verify.ts',
      'scripts/site-provision.mjs','scripts/site-operations/admission.ts','scripts/site-operations/cloud-provision.ts','scripts/site-operations/verify-group-runtime.ts']) {
      expect(runtimeSourceDigest(`${runtime}\n${entry(path)}`,'admission')).toBe(runtimeSourceDigest(runtime,'admission'))
      expect(runtimeSourceDigest(`${runtime}\n${entry(path)}`)).not.toBe(runtimeSourceDigest(runtime))
    }
  })
})
