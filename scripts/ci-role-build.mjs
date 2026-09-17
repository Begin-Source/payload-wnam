import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { encodeWorkerSource } from './encode-worker-source.mjs'

if (process.env.WORKERS_CI !== '1') throw new Error('Role applications build only in Cloudflare Builds')
const root = process.cwd()
// Each role has its own source tree, component map and build output. The root
// shared application's artifacts remain intact for the existing release gate.
for (const role of ['central','site']) {
  const cwd = resolve('.cloudflare-ci/roles',role)
  rmSync(cwd,{ recursive: true,force: true }); mkdirSync(cwd,{ recursive: true })
  cpSync('src',resolve(cwd,'src'),{ recursive: true,filter: path => !['src/app','src/middleware.ts','src/worker.ts','src/payload.config.ts'].map(value => resolve(value)).includes(resolve(path)) })
  cpSync(`roles/${role}/app`,resolve(cwd,'src/app'),{ recursive: true })
  // Shared writing helpers currently live beneath app/ but contain no routes.
  // Preserve their import paths without mounting the shared HTTP controllers.
  cpSync('src/app/api/pipeline/lib',resolve(cwd,'src/app/api/pipeline/lib'),{ recursive: true })
  mkdirSync(resolve(cwd,'src/app/api/pipeline/draft-skeleton'),{ recursive: true })
  cpSync('src/app/api/pipeline/draft-skeleton/runDraftSkeleton.ts',resolve(cwd,'src/app/api/pipeline/draft-skeleton/runDraftSkeleton.ts'))
  mkdirSync(resolve(cwd,'src/app-styles'),{ recursive: true })
  cpSync('src/app/(payload)/custom.scss',resolve(cwd,'src/app-styles/central-admin.scss'))
  cpSync('public',resolve(cwd,'public'),{ recursive: true })
  for (const file of ['package.json','pnpm-lock.yaml','next.config.ts','open-next.config.ts','tsconfig.json','eslint.config.mjs','cloudflare-env.d.ts']) cpSync(file,resolve(cwd,file))
  symlinkSync(resolve(root,'node_modules'),resolve(cwd,'node_modules'),'dir')
  writeFileSync(resolve(cwd,'src/payload.config.ts'),`export { default } from './application-roles/${role}'\n`)
  writeFileSync(resolve(cwd,'worker.ts'),readFileSync(`roles/${role}/worker.ts`,'utf8').replaceAll("'../../src/","'./src/"))
  // These IDs are deliberately synthetic; this manifest cannot target a remote
  // database. Deployment will require a separately verified resource manifest.
  const config = { name: `payload-wnam-${role}-ci`,account_id: 'd487cf34c606620b442632a72272014d',
    main: 'worker.ts',compatibility_date: '2025-08-15',compatibility_flags: ['nodejs_compat','global_fetch_strictly_public'],
    assets: { directory: '.open-next/assets',binding: 'ASSETS' },workers_dev: false,
    d1_databases: [{ binding: 'CENTRAL_D1',database_name: 'central-ci',database_id: '00000000-0000-0000-0000-000000000001',remote: false }],
    r2_buckets: [{ binding: 'CENTRAL_MEDIA',bucket_name: 'central-media-ci',remote: false },
      { binding: 'MASTER_ASSET_ARCHIVE',bucket_name: 'central-archive-ci',remote: false }],
  }
  if (role === 'site') {
    config.d1_databases = ['A','B'].map((name,index) => ({ binding: `SITE_D1_${name}`, database_name: `site-${name.toLowerCase()}-ci`, database_id: `00000000-0000-0000-0000-00000000000${index+2}`, remote: false }))
    config.r2_buckets = ['PUBLIC','PRIVATE'].map(name => ({ binding: `SITE_${name}`, bucket_name: `site-${name.toLowerCase()}-ci`, remote: false }))
    config.services = [['IDENTITY','SiteIdentityService'],['DATA','SiteDataService'],['ROUTING','SiteRoutingService']].map(([binding,entrypoint]) => ({ binding,entrypoint,service: 'payload-wnam-central-ci' }))
    config.vars = { WORKER_GROUP: 'group-1', SITE_ROUTES: JSON.stringify(['a','b'].map((siteId,index) => ({ siteId, localSiteId: index ? 82 : 37, bindingName: `SITE_D1_${siteId.toUpperCase()}`, databaseId: `00000000-0000-0000-0000-00000000000${index+2}`, schemaVersion: 1 }))) }
  }
  writeFileSync(resolve(cwd,'wrangler.jsonc'),JSON.stringify(config,null,2))
  const env = { ...process.env,PAYLOAD_ROLE_BUILD: role,PAYLOAD_CONFIG_PATH: resolve(cwd,'src/payload.config.ts') }
  // Never inherit the connected shared Worker's name override into role builds.
  delete env.WRANGLER_CI_OVERRIDE_NAME; delete env.WRANGLER_CI_MATCH_TAG
  const run = args => execFileSync('pnpm',args,{ cwd,env,stdio: 'inherit' })
  console.log(JSON.stringify({ event: 'role_build_start',role }))
  run(['exec','wrangler','types','cloudflare-role-env.d.ts','--env-interface',role === 'central' ? 'CentralRoleEnv' : 'SiteRoleEnv','--config',resolve(cwd,'wrangler.jsonc')])
  const bindingTypes = readFileSync(resolve(cwd,'cloudflare-role-env.d.ts'),'utf8')
  for (const name of role === 'central' ? ['CENTRAL_D1','CENTRAL_MEDIA','MASTER_ASSET_ARCHIVE','ASSETS'] : ['SITE_D1_A','SITE_D1_B','SITE_PUBLIC','SITE_PRIVATE','IDENTITY','DATA','ROUTING','ASSETS']) assert.ok(bindingTypes.includes(name),`Missing role binding type: ${name}`)
  run(['exec','payload','generate:importmap'])
  const map = readFileSync(resolve(cwd,'src/app/(payload)/admin/importMap.js'),'utf8')
  assert.ok(map.includes('@payloadcms/'), 'Role component map must be generated')
  run(['exec','tsc','--noEmit','--pretty','false'])
  run(['exec','opennextjs-cloudflare','build','--config',resolve(cwd,'wrangler.jsonc')])
  const file = resolve(cwd,'.open-next/server-functions/default/handler.mjs')
  const source = readFileSync(file,'utf8')
  const encoded = await encodeWorkerSource(source)
  assert.ok(!/[^\u0000-\u00ff]/.test(encoded.code),'Role source must retain the verified one-byte source invariant')
  writeFileSync(file,encoded.code)
  run(['exec','wrangler','deploy','--dry-run','--outdir','.cloudflare-ci/bundle','--config',resolve(cwd,'wrangler.jsonc')])
  console.log(JSON.stringify({ event: 'role_build_passed',role }))
}
