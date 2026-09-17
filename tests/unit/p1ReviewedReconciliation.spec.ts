import { describe,expect,it } from 'vitest'
import { runtimeSourceDigest } from '../../scripts/p1-runtime-source.mjs'
import { validateReleaseSelection } from '../../scripts/p1-release-manifests.mjs'

const entry = (path: string,hash = 'a'.repeat(40)) => `100644 blob ${hash}\t${path}`
const pinned = () => ({ provisionRequest: 'operations/provision/p1-d.json',reconcile: {
  commit: 'a'.repeat(40),releaseId: 'b'.repeat(64),sourceDigest: 'c'.repeat(64),
} })
describe('reviewed P1 release reconciliation',() => {
  it('requires unchanged runtime, dependencies, assets, build scripts and operational inputs',() => {
    for (const path of ['src/app/page.tsx','public/logo.svg','package.json','pnpm-lock.yaml','wrangler.jsonc',
      'scripts/ci-build.mjs','scripts/site-operations/release.ts','operations/provision/p1-d.json']) {
      expect(runtimeSourceDigest(entry(path))).not.toBe(runtimeSourceDigest(entry(path,'b'.repeat(40))))
      expect(runtimeSourceDigest(entry(path))).not.toBe(runtimeSourceDigest(''))
    }
    expect(() => runtimeSourceDigest('malformed')).toThrow('Invalid Git tree entry')
  })
  it('permits only named maintenance entrypoints, documentation and tests to change',() => {
    const runtime = entry('src/app/page.tsx')
    for (const path of ['AGENTS.md','docs/report.md','tests/unit/report.spec.ts','operations/p1-release.json',
      'scripts/p1-runtime-source.mjs','scripts/p1-release-manifests.mjs','scripts/ci-p1-deploy.mjs',
      'scripts/ci-p1-group-release.ts','scripts/site-operations/cloud-verify.ts']) {
      expect(runtimeSourceDigest(`${runtime}\n${entry(path)}`)).toBe(runtimeSourceDigest(runtime))
    }
    expect(runtimeSourceDigest(`${entry('src/z.ts')}\n${runtime}`)).toBe(runtimeSourceDigest(`${runtime}\n${entry('src/z.ts')}`))
  })
  it('rejects changed source, unpinned identities and unknown selection capabilities',() => {
    expect(validateReleaseSelection(pinned(),'c'.repeat(64))).toEqual(pinned())
    expect(validateReleaseSelection({ provisionRequest: 'operations/provision/p1-d.json' },undefined)).toEqual({ provisionRequest: 'operations/provision/p1-d.json' })
    expect(() => validateReleaseSelection(pinned(),'d'.repeat(64))).toThrow('runtime source changes')
    for (const value of [null,[],{ ...pinned(),force: true },{ ...pinned(),reconcile: null },
      { ...pinned(),provisionRequest: '../foreign.json' },
      ...['commit','releaseId','sourceDigest'].map(key => ({ ...pinned(),reconcile: { ...pinned().reconcile,[key]: '' } })),
      { ...pinned(),reconcile: { ...pinned().reconcile,allowUpload: true } }]) {
      expect(() => validateReleaseSelection(value,'c'.repeat(64))).toThrow()
    }
  })
})
