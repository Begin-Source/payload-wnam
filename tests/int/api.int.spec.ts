import { runnerRecoveryWhere } from '@/utilities/workflowRecoveryWhere'
import { claimWorkflowJob, heartbeatWorkflowLease, patchLeasedWorkflowJob, releaseWorkflowLease, recoverExpiredWorkflowJobs, WorkflowLeaseLostError } from '@/utilities/workflowJobLease'
import type { MigrateUpArgs } from '@payloadcms/db-d1-sqlite'
import { up as migrateBlueprintVersions } from '@/migrations/20260916_120000_blueprint_version_history'
import { getCloudflareD1Binding } from '@/utilities/cloudflareD1Binding'
// @vitest-environment node

import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'

let payload: Payload
let workflowTenantId: number

describe('API', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    workflowTenantId = (await payload.create({ collection: 'tenants', data: { name: 'Workflow CI', slug: 'workflow-ci', domain: 'workflow-ci.test' } })).id
  }, 60_000)

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
    await d1.prepare('UPDATE "_site_blueprints_v" SET version_amz_site_config_json = ? WHERE id = ?')
      .bind(JSON.stringify({ footer: null }), before.docs[0].id).run()
    await expect(payload.restoreVersion({ collection: 'site-blueprints', id: before.docs[0].id, depth: 0 })).rejects.toThrow()
    const afterRejectedRestore = await payload.findByID({ collection: 'site-blueprints', id: blueprint.id, depth: 0 })
    expect(afterRejectedRestore.amzSiteConfigJson).toMatchObject({ brand: { name: 'Original' } })
    await expect(payload.restoreVersion({ collection: 'site-blueprints', id: before.docs[0].id, user: outsider, overrideAccess: false })).rejects.toThrow()
    await expect(payload.findVersions({ collection: 'site-blueprints', overrideAccess: false })).rejects.toThrow()
  })

  it('fetches users', async () => {
    const users = await payload.find({
      collection: 'users',
    })
    expect(users).toBeDefined()
  })

  it('atomically claims jobs and fences writes from an expired owner', async () => {
    if (process.env.PAYLOAD_TEST_MODE !== 'isolated') throw new Error('Lease smoke requires isolated CI')
    const job = await payload.create({ collection: 'workflow-jobs', data: { tenant: workflowTenantId, label: 'Lease CI', jobType: 'custom', status: 'pending' } })
    const claims = await Promise.all([claimWorkflowJob(payload, job.id), claimWorkflowJob(payload, job.id)])
    expect(claims.filter(Boolean)).toHaveLength(1)
    const first = claims.find(claim => claim !== null)!
    await heartbeatWorkflowLease(first)
    await expect(payload.update({ collection: 'workflow-jobs', id: job.id, data: { status: 'pending' } })).rejects.toThrow('任务正在执行')
    const d1 = getCloudflareD1Binding() as D1Database
    await d1.prepare('UPDATE workflow_jobs SET lease_expires_at = ? WHERE id = ?')
      .bind(new Date(Date.now() - 1000).toISOString(), job.id).run()
    expect(await recoverExpiredWorkflowJobs(payload)).toBe(1)
    const second = await claimWorkflowJob(payload, job.id)
    expect(second).not.toBeNull()
    await expect(patchLeasedWorkflowJob(first, { status: 'completed' })).rejects.toBeInstanceOf(WorkflowLeaseLostError)
    await releaseWorkflowLease(first)
    await patchLeasedWorkflowJob(second!, { status: 'completed', output: { owner: 'second' } })
    await releaseWorkflowLease(second!)
    const stored = await payload.findByID({ collection: 'workflow-jobs', id: job.id, depth: 0 })
    expect(stored).toMatchObject({ status: 'completed', attemptCount: 2, output: { owner: 'second' } })
  })

  it('allows only one runner lease per site, including separate runner jobs', async () => {
    if (process.env.PAYLOAD_TEST_MODE !== 'isolated') throw new Error('Lease smoke requires isolated CI')
    const tenant = await payload.create({ collection: 'tenants', data: { name: 'Runner CI', slug: 'runner-ci', domain: 'runner-ci.test' } })
    const site = await payload.create({ collection: 'sites', data: { name: 'Runner CI', slug: 'runner-ci', tenant: tenant.id, publicLocaleCodes: ['en'], defaultPublicLocale: 'en' }, depth: 0 })
    const jobs = await Promise.all([1, 2].map(n => payload.create({ collection: 'workflow-jobs', data: { label: 'Runner CI ' + n, jobType: 'site_content_runner', site: site.id, tenant: tenant.id, status: 'pending' }, depth: 0 })))
    const leases = await Promise.all(jobs.map(job => claimWorkflowJob(payload, job.id, { runner: true })))
    expect(leases.filter(Boolean)).toHaveLength(1)
    const lease = leases.find(value => value !== null)!
    await patchLeasedWorkflowJob(lease, { status: 'completed' })
    await releaseWorkflowLease(lease)
  })

  it('executes a constrained no-cost tick only once under concurrent requests', async () => {
    if (process.env.PAYLOAD_TEST_MODE !== 'isolated') throw new Error('Tick smoke requires isolated CI')
    const job = await payload.create({ collection: 'workflow-jobs', data: { tenant: workflowTenantId, label: 'Tick CI', jobType: 'custom', status: 'pending' } })
    const { POST } = await import('@/app/api/pipeline/tick/route')
    const request = () => new Request('https://ci.test/api/pipeline/tick', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-token': process.env.PAYLOAD_SECRET! },
      body: JSON.stringify({ execute: true, constrainedJobIds: [job.id] }),
    })
    const results = await Promise.all([POST(request()), POST(request())])
    const bodies = await Promise.all(results.map(result => result.json() as Promise<{ executed?: boolean }>))
    expect(bodies.filter(body => body.executed)).toHaveLength(1)
    expect((await payload.findByID({ collection: 'workflow-jobs', id: job.id, depth: 0 })).status).toBe('completed')
  })


  it('filters terminal failures before the runner recovery limit', async () => {
    if (process.env.PAYLOAD_TEST_MODE !== 'isolated') throw new Error('Recovery smoke requires isolated CI')
    const d1 = getCloudflareD1Binding() as D1Database
    const inserted = await d1.batch(Array.from({ length: 30 }, (_, n) => d1.prepare(
      "INSERT INTO workflow_jobs (label, job_type, status, error_code, error_message, updated_at) VALUES (?, 'site_content_runner', 'failed', 'RUNNER_FAILURE', 'Permanent invalid input', '2000-01-01T00:00:00.000Z')",
    ).bind('Terminal CI ' + n)))
    const terminalIds = inserted.map(row => row.meta.last_row_id)
    const pending = await payload.create({ collection: 'workflow-jobs', data: { tenant: workflowTenantId, label: 'Recoverable CI', jobType: 'site_content_runner', status: 'pending' } })
    const candidates = await payload.find({
      collection: 'workflow-jobs',
      where: { and: [runnerRecoveryWhere(), { id: { in: [...terminalIds, pending.id] } }] },
      sort: 'updatedAt', limit: 1, depth: 0,
    })
    expect(candidates.docs.map(doc => doc.id)).toEqual([pending.id])
  })

})
