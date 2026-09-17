import { sqliteD1Adapter, sql } from '@payloadcms/db-d1-sqlite'
import { createSiteD1Proxy } from './d1'

/** Payload 3.82.1 updates a row with INSERT ... ON CONFLICT and binds the same
 * row twice. A 51-column article therefore exceeds D1's 100 parameter limit.
 * Reuse the inserted values through SQLite's excluded row for this exact case;
 * keep one atomic statement, every column, returning values and adapter hooks.
 */
export function createSitePayloadAdapter(): ReturnType<typeof sqliteD1Adapter> {
  const definition = sqliteD1Adapter({ binding: createSiteD1Proxy(), push: false, allowIDOnCreate: true })
  const initialize = definition.init
  return { ...definition, init: args => {
    const adapter = initialize(args)
    const insert = adapter.insert.bind(adapter)
    adapter.insert = options => {
      const { onConflictDoUpdate: conflict, values, tableName } = options
      if (!Array.isArray(values) && conflict?.set === values) {
        const table = adapter.tables[tableName]
        const set = Object.fromEntries(Object.entries(values).map(([key, value]) => {
          // Preserve SQL expressions/defaults: evaluating them twice can have
          // different semantics. Payload's normal transformed row is plain data.
          if (value === undefined || (value && typeof value === 'object' && 'getSQL' in value)) return [key, value]
          const column = table[key]
          if (!column || typeof column.name !== 'string') throw new Error('Unknown site upsert column')
          return [key, sql`excluded.${sql.identifier(column.name)}`]
        }))
        return insert({ ...options, onConflictDoUpdate: { ...conflict, set } })
      }
      return insert(options)
    }
    return adapter
  } }
}
