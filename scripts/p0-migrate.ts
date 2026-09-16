import { getPayload } from 'payload'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-d1-sqlite'
import { p0MaintenanceTarget } from './p0-maintenance'

const target = p0MaintenanceTarget()
process.env.PAYLOAD_MIGRATING = 'true'
const [{ default: config }, { migrations }] = await Promise.all([
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
await payload.destroy()
console.log(JSON.stringify({ event: 'p0_migrations_ready', database: target.d1_databases[0].database_id, migrations: migrations.length }))
process.exit(0)
