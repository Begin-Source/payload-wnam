import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

// Only these maintenance/reporting entrypoints may change in a reviewed
// reconciliation build. Runtime source, assets, dependency/configuration files,
// role build scripts and all other operation inputs remain fingerprinted.
const maintenance = new Set(['AGENTS.md','operations/p1-release.json','scripts/p1-runtime-source.mjs',
  'scripts/p1-release-manifests.mjs','scripts/ci-p1-deploy.mjs','scripts/ci-p1-group-release.ts','scripts/site-operations/cloud-verify.ts'])
export function runtimeSourceDigest(tree) {
  const lines = tree.trim().split('\n').filter(Boolean).filter(line => {
    const path = line.split('\t')[1]
    if (!path) throw new Error('Invalid Git tree entry')
    return !maintenance.has(path) && !path.startsWith('docs/') && !path.startsWith('tests/')
  }).sort()
  return createHash('sha256').update(lines.join('\n')+'\n').digest('hex')
}
export function currentRuntimeSourceDigest() {
  return runtimeSourceDigest(execFileSync('git',['ls-tree','-r','--full-tree','HEAD'],{ encoding: 'utf8' }))
}
