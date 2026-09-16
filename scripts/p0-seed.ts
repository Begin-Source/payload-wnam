import { getPayload } from 'payload'
import type { User } from '../src/payload-types'
import { p0MaintenanceTarget } from './p0-maintenance'

const maintenance = p0MaintenanceTarget()
const password = process.env.P0_TEST_PASSWORD
if (!password || password.length < 32) throw new Error('P0 fixture password missing')
const { default: config } = await import('../src/payload.config')
const payload = await getPayload({ config, disableOnInit: true })
const email = 'p0-isolation@example.invalid'
const found = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1 })
const user = found.docs[0] ?? await payload.create({ collection: 'users', data: { email, password, roles: ['user'] } })
// Only a synthetic account in the explicitly allowlisted P0 databases.
await payload.update({ collection: 'users', id: user.id, data: { password, roles: ['super-admin'] },
  req: { user: { ...user, collection: 'users', roles: ['super-admin'] } as User & { collection: 'users' } } })
await payload.destroy()
console.log(JSON.stringify({ event: 'p0_fixture_user_ready', database: maintenance.d1_databases[0].database_id }))
process.exit(0)
