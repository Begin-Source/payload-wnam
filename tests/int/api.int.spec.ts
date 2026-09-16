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

  it('exposes additive SQL for the blueprint version tables in isolated CI', async () => {
    if (process.env.PAYLOAD_TEST_MODE !== 'isolated') return
    const d1 = getCloudflareD1Binding() as D1Database
    const schema = await d1.prepare(
      "SELECT name, sql FROM sqlite_master WHERE name GLOB '_site_blueprints_v*' AND sql IS NOT NULL ORDER BY type DESC, name",
    ).all<{ name: string; sql: string }>()
    expect(schema.results.length).toBeGreaterThan(0)
    console.info('BLUEPRINT_VERSION_SCHEMA=' + Buffer.from(JSON.stringify(schema.results)).toString('base64'))
  })

  it('rejects invalid design writes and restores an earlier validated version', async () => {
    if (process.env.PAYLOAD_TEST_MODE !== 'isolated') throw new Error('Design smoke requires isolated CI')
    const tenant = await payload.create({ collection: 'tenants', data: { name: 'Design CI', slug: 'design-ci' } })
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
    const before = await payload.findVersions({ collection: 'site-blueprints', where: { parent: { equals: blueprint.id } }, sort: '-createdAt', limit: 1 })
    expect(before.docs).toHaveLength(1)
    await expect(payload.update({ collection: 'site-blueprints', id: blueprint.id, data: { amzSiteConfigJson: { footer: null } } })).rejects.toThrow()
    const unchanged = await payload.findByID({ collection: 'site-blueprints', id: blueprint.id, depth: 0 })
    expect(unchanged.amzSiteConfigJson).toMatchObject({ brand: { name: 'Original' } })
    await payload.update({ collection: 'site-blueprints', id: blueprint.id, data: { amzSiteConfigJson: { brand: { name: 'Updated' } } }, depth: 0 })
    const restored = await payload.restoreVersion({ collection: 'site-blueprints', id: before.docs[0].id, depth: 0 })
    expect(restored.amzSiteConfigJson).toMatchObject({ brand: { name: 'Original' } })
    await expect(payload.findVersions({ collection: 'site-blueprints', overrideAccess: false })).rejects.toThrow()
  })

  it('fetches users', async () => {
    const users = await payload.find({
      collection: 'users',
    })
    expect(users).toBeDefined()
  })
})
