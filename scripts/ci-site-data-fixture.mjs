import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

/** Runs only inside the cloud identity harness's actual named service bindings.
 * Full Payload materialization has separate integration tests; these minimal
 * schemas prove RPC, authorization, candidate persistence and binary transport. */
export async function verifySiteDataRPC({ mf,db,site,cookieA,cookieB }) {
  if (process.env.WORKERS_CI !== '1') throw new Error('Data RPC fixture runs only in Cloudflare Builds')
  const { migrateCentralMasters,migrateSiteMasters } = await import('../src/site-control/masterSchema.ts')
  const { migrateCentralConfigs,migrateSiteConfigs } = await import('../src/site-control/configSchema.ts')
  const { migrateCentralAssets,migrateSiteAssets } = await import('../src/site-control/assetSchema.ts')
  const { snapshotJSON,masterDigest,masterReference,projectMasterData } = await import('../src/site-control/masterSnapshot.ts')
  const { configSnapshotJSON,configReference,projectConfigData } = await import('../src/site-control/configSnapshot.ts')
  const { assetSnapshotJSON,assetBytesDigest,assetReference,assetArchiveKey } = await import('../src/site-control/assetSnapshot.ts')
  const stamp = new Date().toISOString()
  await db.exec('CREATE TABLE sites(id INTEGER PRIMARY KEY,runtime_site_id TEXT,tenant_id INTEGER)')
  await db.prepare("INSERT INTO sites VALUES(137,'a',1),(182,'b',2)").run()
  await migrateCentralMasters(db); await migrateCentralConfigs(db); await migrateCentralAssets(db)
  const masterSnapshot = { format: 1,collection: 'authors',recordId: '100',revision: 1,tenantId: 1,sourceUpdatedAt: stamp,
    data: projectMasterData('authors',{ displayName: 'Private author',gdprRegion: 'other',gdprLawfulBasis: 'not_applicable' }),relations: {} }
  const masterJSON = snapshotJSON(masterSnapshot),master = { ...masterSnapshot,digest: await masterDigest(masterJSON),operationId: 'rpc-author',createdAt: stamp }
  await db.prepare('INSERT INTO central_master_releases VALUES(?,?,?,?,?,?,?,?)').bind(master.collection,master.recordId,1,1,master.digest,masterJSON,master.operationId,stamp).run()
  const configSnapshot = { format: 1,kind: 'llm-prompts',siteId: '',revision: 1,tenantId: 0,sourceRecordId: '1',sourceUpdatedAt: stamp,
    data: projectConfigData('llm-prompts',{ globalSystemPrompt: 'Global policy',temperature: 0.2,defaultModel: 'fixture' }) }
  const configJSON = configSnapshotJSON(configSnapshot),config = { ...configSnapshot,digest: await masterDigest(configJSON),operationId: 'rpc-config',createdAt: stamp }
  await db.prepare('INSERT INTO central_config_releases VALUES(?,?,?,?,?,?,?,?)').bind(config.kind,'',1,0,config.digest,configJSON,config.operationId,stamp).run()
  const bytes = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6K0AAAAASUVORK5CYII=','base64'))
  const assetSnapshot = { format: 1,recordId: '200',revision: 1,tenantId: 1,sourceUpdatedAt: stamp,alt: 'Private tenant portrait',
    mimeType: 'image/png',size: bytes.length,sha256: await assetBytesDigest(bytes),width: 1,height: 1 }
  const assetJSON = assetSnapshotJSON(assetSnapshot),asset = { ...assetSnapshot,digest: await masterDigest(assetJSON),operationId: 'rpc-asset',createdAt: stamp }
  await db.prepare('INSERT INTO central_asset_releases VALUES(?,?,?,?,?,?,?)').bind(asset.recordId,1,1,asset.digest,assetJSON,asset.operationId,stamp).run()
  const archive = await mf.getR2Bucket('MASTER_ASSET_ARCHIVE','central')
  await archive.put(assetArchiveKey(asset),bytes)
  const siteDBs = []
  for (const [name,id,tenant] of [['A',37,1],['B',82,2]]) {
    const local = await mf.getD1Database(`SITE_${name}`,'site'); siteDBs.push(local)
    await local.batch([
      'CREATE TABLE tenants(id INTEGER PRIMARY KEY,central_source_record_id TEXT)',
      'CREATE TABLE sites(id INTEGER PRIMARY KEY,tenant_id INTEGER)',
      'CREATE TABLE site_quotas(id INTEGER PRIMARY KEY,site_id INTEGER)',
      `CREATE TABLE media(id INTEGER PRIMARY KEY,alt TEXT,site_id INTEGER,tenant_id INTEGER,filename TEXT,prefix TEXT,mime_type TEXT,filesize INTEGER,
        width INTEGER,height INTEGER,created_by_id INTEGER,central_source_record_id TEXT,central_source_revision INTEGER,central_source_synced_at TEXT,created_at TEXT,updated_at TEXT)`,
    ].map(sql => local.prepare(sql)))
    await local.prepare('INSERT INTO tenants VALUES(?,?)').bind(tenant*10,String(tenant)).run()
    await local.prepare('INSERT INTO sites VALUES(?,?)').bind(id,tenant*10).run()
    await migrateSiteMasters(local); await migrateSiteConfigs(local); await migrateSiteAssets(local)
  }
  const post = (target,path,body,cookie=target==='a'?cookieA:cookieB) => site.fetch(`https://cms-site-${target}.beginos.org${path}`,{
    method: 'POST',headers: { origin: `https://cms-site-${target}.beginos.org`,'content-type': 'application/json',...(cookie?{cookie}:{}) },body: JSON.stringify(body) })
  const masterRef = masterReference(master),configRef = configReference(config),assetRef = assetReference(asset)
  assert.equal((await post('a','/test/data/master',masterRef)).status,403,'Editor must not import shared data')
  await db.prepare("UPDATE site_runtime_access SET role='manager'").run()
  assert.equal((await post('a','/test/data/master',masterRef,null)).status,401)
  assert.equal((await site.fetch('https://cms-site-a.beginos.org/test/data-no-http')).status,404)
  assert.equal((await site.fetch('https://cms-site-a.beginos.org/test/data-no-publisher')).status,200)
  const wrongSite = await post('a','/test/data-raw',{ siteId: 'b',adminHost: 'cms-site-b.beginos.org',routingVersion: 1,ref: masterRef })
  assert.deepEqual(await wrongSite.json(),{ ok: false,reason: 'denied' })
  assert.equal((await post('a','/test/data/master',masterRef)).status,200)
  assert.equal((await post('b','/test/data/master',masterRef)).status,503,'Tenant-private master must not cross sites')
  assert.equal(await siteDBs[0].prepare('SELECT COUNT(*) AS n FROM site_master_releases').first('n'),1)
  assert.equal(await siteDBs[1].prepare('SELECT COUNT(*) AS n FROM site_master_releases').first('n'),0)
  for (const target of ['a','b']) assert.equal((await post(target,'/test/data/config',configRef)).status,200)
  const copies = await Promise.all(Array.from({length:5},async()=>{
    const response = await post('a','/test/data/asset',assetRef)
    assert.equal(response.status,200,await response.clone().text())
    return response.json()
  }))
  assert.equal(new Set(copies.map(copy=>copy.localId)).size,1)
  assert.notEqual(copies[0].localId,200)
  const publicBucket = await mf.getR2Bucket('SITE_PUBLIC','site'),privateBucket = await mf.getR2Bucket('SITE_PRIVATE','site')
  for (const bucket of [publicBucket,privateBucket]) {
    const object = await bucket.get(`sites/a/${assetArchiveKey(asset)}`)
    assert.deepEqual(new Uint8Array(await object.arrayBuffer()),bytes)
  }
  assert.equal((await post('b','/test/data/asset',assetRef)).status,503)
  assert.equal(await publicBucket.head(`sites/b/${assetArchiveKey(asset)}`),null)
  await db.prepare('INSERT INTO central_asset_withdrawals VALUES(?,?,?,?,?,?)').bind(asset.recordId,1,asset.digest,'rpc-withdraw',stamp,'Source withdrawn').run()
  assert.equal((await post('a','/test/data/withdraw',assetRef)).status,200)
  assert.equal((await post('a','/test/data/withdraw',assetRef)).status,200)
  assert.equal((await publicBucket.head(`sites/a/${assetArchiveKey(asset)}`)).customMetadata.assetWithdrawn,'1')
  assert.equal((await post('a','/test/data/asset',assetRef)).status,403)
  await db.prepare("UPDATE site_runtime_access SET role='viewer' WHERE site_id='a'").run()
  const revoked = await post('a','/test/data-raw',{ siteId: 'a',adminHost: 'cms-site-a.beginos.org',routingVersion: 1,ref: masterRef })
  assert.deepEqual(await revoked.json(),{ ok: false,reason: 'denied' })
  await db.prepare("UPDATE site_runtime_access SET role='editor'").run()
  const report = { event: 'site_data_workerd_rpc',ok: true,commit: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    workers:2,databases:3,r2Buckets:3,concurrentAssetCopies:5,
    checks:['named read-only RPC','HTTP and publishing denied','live manager grant','forged destination denied','tenant-private master and asset isolation',
      'global configuration to two sites','candidate persistence','binary asset transport and local media mapping','concurrent copy deduplication','withdrawal and retry','live revocation'],
    scope:'Cloudflare Builds native service bindings with minimal role schemas. Full independent Payload behavior has separate native integration tests; formal roles, UI and queue delivery are not deployed.' }
  writeFileSync('.cloudflare-ci/site-data.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report))
}
