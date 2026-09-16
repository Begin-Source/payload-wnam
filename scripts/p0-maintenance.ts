import { readFileSync } from 'node:fs'

export function p0MaintenanceTarget() {
  const allowed = new Set(['31d5906e-f276-4a61-87c1-31a13e7131e6', '20fd152f-7b7c-4bc6-be81-1a36ea720060'])
  const config = JSON.parse(readFileSync('.cloudflare-ci/p0-migration.json', 'utf8'))
  if (process.env.WORKERS_CI !== '1' || process.env.PAYLOAD_P0_MIGRATION !== '1' ||
    config.account_id !== 'd487cf34c606620b442632a72272014d' ||
    config.d1_databases?.length !== 1 || config.d1_databases[0].binding !== 'D1' ||
    !allowed.has(config.d1_databases[0].database_id)) throw new Error('P0 maintenance target rejected')
  return config
}
