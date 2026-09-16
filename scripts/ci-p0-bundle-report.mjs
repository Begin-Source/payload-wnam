import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_BRANCH !== 'feat/site-per-d1') process.exit(0)
const meta = JSON.parse(readFileSync('.open-next/server-functions/default/handler.mjs.meta.json', 'utf8'))
const inputs = new Map()
for (const output of Object.values(meta.outputs)) {
  for (const [name, input] of Object.entries(output.inputs)) {
    inputs.set(name, (inputs.get(name) ?? 0) + input.bytesInOutput)
  }
}
const packages = new Map()
for (const [name, bytes] of inputs) {
  const last = name.lastIndexOf('node_modules/')
  if (last < 0) continue
  const parts = name.slice(last + 'node_modules/'.length).split('/')
  const pkg = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
  packages.set(pkg, (packages.get(pkg) ?? 0) + bytes)
}
const sorted = values => [...values].map(([module, bytesInOutput]) => ({ module, bytesInOutput }))
  .sort((a, b) => b.bytesInOutput - a.bytesInOutput).slice(0, 35)
const report = {
  event: 'p0_bundle_composition', commit: process.env.WORKERS_CI_COMMIT_SHA,
  packages: sorted(packages), largestInputs: sorted(inputs),
  webpack: readdirSync('.cloudflare-ci').filter(name => /^module-sizes-.*\.json$/.test(name)).map(name => ({
    compiler: name, modules: JSON.parse(readFileSync(`.cloudflare-ci/${name}`, 'utf8')).slice(0, 25),
  })),
  scope: 'OpenNext esbuild output contribution before final Wrangler minification; webpack source sizes are separate, not heap measurements. No module source or heap contents included.',
}
writeFileSync('.cloudflare-ci/p0-bundle-composition.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report))
