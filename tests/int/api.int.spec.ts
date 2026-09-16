import type { MigrateUpArgs } from '@payloadcms/db-d1-sqlite'
import { up as migrateBlueprintVersions } from '@/migrations/20260916_120000_blueprint_version_history'
import { getCloudflareD1Binding } from '@/utilities/cloudflareD1Binding'
// @vitest-environment node

import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'

let payload: Payload

describe('API', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  it('creates blueprint version tables in isolated CI', async () => {
    if (process.env.PAYLOAD_TEST_MODE !== 'isolated') return
    const d1 = getCloudflareD1Binding() as D1Database
    const schema = await d1.prepare(
      "SELECT name, sql FROM sqlite_master WHERE name GLOB '_site_blueprints_v*' AND sql IS NOT NULL ORDER BY type DESC, name",
    ).all<{ name: string; sql: string }>()
    expect(schema.results.length).toBeGreaterThan(0)
  })

  it('rejects invalid design writes and restores an earlier validated version', async () => {
    if (process.env.PAYLOAD_TEST_MODE !== 'isolated') throw new Error('Design smoke requires isolated CI')
    const tenant = await payload.create({ collection: 'tenants', data: { name: 'Design CI', slug: 'design-ci', domain: 'design-ci.test' } })
    const site = await payload.create({
      collection: 'sites',
      data: { name: 'Design CI', slug: 'design-ci', tenant: tenant.id, publicLocaleCodes: ['en'], defaultPublicLocale: 'en', siteLayout: 'amz-template-1' },
      depth: 0,
    })
    const blueprint = await payload.create({
      collection: 'site-blueprints',
      data: { name: 'Design CI', slug: 'design-ci', tenant: tenant.id, site: site.id, amzSiteConfigJson: { brand: { name: 'Original' } } },
      depth: 0,
    })
    // Simulate an existing design created before versioning was enabled.
    const d1 = getCloudflareD1Binding() as D1Database
    await d1.prepare('DELETE FROM "_site_blueprints_v" WHERE parent_id = ?').bind(blueprint.id).run()
    const db = (payload.db as unknown as { drizzle: MigrateUpArgs['db'] }).drizzle
    await migrateBlueprintVersions({ db })
    await migrateBlueprintVersions({ db })
    const before = await payload.findVersions({ collection: 'site-blueprints', where: { parent: { equals: blueprint.id } }, sort: '-createdAt', limit: 1 })
    expect(before.docs).toHaveLength(1)
    await expect(payload.update({ collection: 'site-blueprints', id: blueprint.id, data: { amzSiteConfigJson: { footer: null } } })).rejects.toThrow()
    const unchanged = await payload.findByID({ collection: 'site-blueprints', id: blueprint.id, depth: 0 })
    expect(unchanged.amzSiteConfigJson).toMatchObject({ brand: { name: 'Original' } })
    await payload.update({ collection: 'site-blueprints', id: blueprint.id, data: { amzSiteConfigJson: { brand: { name: 'Updated' } } }, depth: 0 })
    const restored = await payload.restoreVersion({ collection: 'site-blueprints', id: before.docs[0].id, depth: 0 })
    expect(restored.amzSiteConfigJson).toMatchObject({ brand: { name: 'Original' } })
    const outsider = { id: 99999, collection: 'users', roles: ['general-manager'], tenants: [{ tenant: tenant.id + 1000 }] }
    const hidden = await payload.findVersions({ collection: 'site-blueprints', user: outsider, overrideAccess: false })
    expect(hidden.docs).toHaveLength(0)
    await expect(payload.restoreVersion({ collection: 'site-blueprints', id: before.docs[0].id, user: outsider, overrideAccess: false })).rejects.toThrow()
    await expect(payload.findVersions({ collection: 'site-blueprints', overrideAccess: false })).rejects.toThrow()
  })

  it('fetches users', async () => {
    const users = await payload.find({
      collection: 'users',
    })
    expect(users).toBeDefined()
  })
})
