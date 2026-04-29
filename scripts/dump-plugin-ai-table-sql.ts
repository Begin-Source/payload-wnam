/**
 * Load Payload (OPENAI_API_KEY) and print drizzle column .name for plugin_ai tables.
 * Run: OPENAI_API_KEY=sk-x pnpm exec tsx scripts/dump-plugin-ai-table-sql.ts
 */
import 'dotenv/config'

import { getPayload } from 'payload'
import config from '../src/payload.config.js'

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    process.env.OPENAI_API_KEY = 'sk-placeholder-for-schema-dump'
  }
  const payload = await getPayload({ config })
  const adapter = payload.db as unknown as { tables: Record<string, Record<string, unknown>> }
  for (const tname of ['plugin_ai_instructions', 'plugin_ai_instructions_images'] as const) {
    const t = adapter.tables[tname]
    if (!t) {
      console.log('missing', tname)
      continue
    }
    const tableSqlName = (t._ as { name?: string } | undefined)?.name ?? tname
    console.log('TABLE', tableSqlName)
    for (const [k, v] of Object.entries(t)) {
      if (k === '_' || k.startsWith('enable') || k === 'id' && typeof v === 'object') {
        /* maybe skip meta */
      }
      if (v && typeof v === 'object' && v !== null && 'name' in v && 'columnType' in v) {
        const c = v as { name: string; columnType: string; notNull: boolean; hasDefault: boolean }
        console.log(' ', k, '->', c.name, c.columnType, 'notNull=', c.notNull, 'def=', c.hasDefault)
      }
    }
  }
  await payload.db.destroy()
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
