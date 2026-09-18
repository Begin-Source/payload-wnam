import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

// Only these maintenance/reporting entrypoints may change in a reviewed
// reconciliation build. Runtime source, assets, dependency/configuration files,
// role build scripts and all other operation inputs remain fingerprinted.
const maintenance = new Set(['AGENTS.md','operations/p1-release.json','scripts/p1-runtime-source.mjs',
  'scripts/p1-release-manifests.mjs','scripts/ci-p0-deploy.mjs','scripts/ci-p1-deploy.mjs','scripts/ci-p1-group-release.ts','scripts/site-operations/cloud-verify.ts'])
// This distinct operation retains central runtime but may create a site using
// checked site artifacts. Only explicitly reviewed cloud-only entrypoints are
// additional exclusions; the ordinary reconciliation policy remains unchanged.
const admissionMaintenance = new Set(['scripts/p1-admission-selection.mjs','scripts/ci-p1-admission.mjs',
  'scripts/ci-p1-admission-verify.ts','scripts/site-provision.mjs','scripts/site-operations/admission.ts',
  'scripts/site-operations/cloud-provision.ts','scripts/site-operations/verify-group-runtime.ts'])
export function runtimeSourceDigest(tree,operation = 'release') {
  if (!['release','admission'].includes(operation)) throw new Error('Unknown runtime source policy')
  const lines = tree.trim().split('\n').filter(Boolean).filter(line => {
    const path = line.split('\t')[1]
    if (!path) throw new Error('Invalid Git tree entry')
    return !maintenance.has(path) && !(operation === 'admission' && admissionMaintenance.has(path)) && !path.startsWith('docs/') && !path.startsWith('tests/')
  }).sort()
  return createHash('sha256').update(lines.join('\n')+'\n').digest('hex')
}
export function currentRuntimeSourceDigest(operation = 'release') {
  return runtimeSourceDigest(execFileSync('git',['ls-tree','-r','--full-tree','HEAD'],{ encoding: 'utf8' }),operation)
}
