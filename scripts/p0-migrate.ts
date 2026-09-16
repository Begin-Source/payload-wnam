import { getPayload } from 'payload'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-d1-sqlite'
import { p0MaintenanceTarget } from './p0-maintenance'
import { d1ClientFromPayload } from '../src/utilities/d1NarrowUpdate'

const target = p0MaintenanceTarget()
process.env.PAYLOAD_MIGRATING = 'true'
const [{ default: config, disposeP0PlatformProxy }, { migrations }] = await Promise.all([
  import('../src/payload.config'), import('../src/migrations'),
])
const payload = await getPayload({ config, disableOnInit: true })
// The curated index carries dependencies that are not chronological. CLI file
// discovery sorts names and would ALTER keyword_batch_presets before CREATE.
await payload.db.migrate({ migrations: migrations.map(migration => ({
  name: migration.name,
  up: (args: unknown) => migration.up(args as MigrateUpArgs),
  down: (args: unknown) => migration.down(args as MigrateDownArgs),
})) })
const client = d1ClientFromPayload(payload)
if (!client) throw new Error('P0 migration D1 client missing')
await client.prepare('CREATE TABLE IF NOT EXISTS p0_queue_receipts (job_id INTEGER PRIMARY KEY, deliveries INTEGER NOT NULL)').bind().run()
await payload.destroy()
await disposeP0PlatformProxy()
console.log(JSON.stringify({ event: 'p0_migrations_ready', database: target.d1_databases[0].database_id, migrations: migrations.length }))
process.exit(0)
