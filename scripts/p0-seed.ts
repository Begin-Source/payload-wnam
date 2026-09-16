import { readFileSync } from 'node:fs'
import { getPayload } from 'payload'
import type { User } from '../src/payload-types'

const allowed = new Set(['31d5906e-f276-4a61-87c1-31a13e7131e6', '20fd152f-7b7c-4bc6-be81-1a36ea720060'])
const maintenance = JSON.parse(readFileSync('.cloudflare-ci/p0-migration.json', 'utf8'))
if (process.env.WORKERS_CI !== '1' || process.env.PAYLOAD_P0_MIGRATION !== '1' ||
  maintenance.account_id !== 'd487cf34c606620b442632a72272014d' ||
  !allowed.has(maintenance.d1_databases?.[0]?.database_id)) throw new Error('P0 seed target rejected')
const password = process.env.P0_TEST_PASSWORD
if (!password || password.length < 32) throw new Error('P0 fixture password missing')
const { default: config } = await import('../src/payload.config')
const payload = await getPayload({ config })
const email = 'p0-isolation@example.invalid'
const found = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1 })
const user = found.docs[0] ?? await payload.create({ collection: 'users', data: { email, password, roles: ['user'] } })
// Only a synthetic account in the explicitly allowlisted P0 databases.
await payload.update({ collection: 'users', id: user.id, data: { password, roles: ['super-admin'] },
  req: { user: { ...user, collection: 'users', roles: ['super-admin'] } as User & { collection: 'users' } } })
await payload.destroy()
console.log(JSON.stringify({ event: 'p0_fixture_user_ready', database: maintenance.d1_databases[0].database_id }))
process.exit(0)
