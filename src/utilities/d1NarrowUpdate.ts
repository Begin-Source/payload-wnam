import type { Payload } from 'payload'

type D1Prepared = {
  bind: (...args: unknown[]) => {
    run: () => Promise<unknown>
  }
}

type D1Client = {
  prepare: (sql: string) => D1Prepared
}

function d1ClientFromPayload(payload: Payload): D1Client | null {
  const db = payload.db as unknown as { client?: unknown } | undefined
  const client = db?.client
  if (!client || typeof client !== 'object' || typeof (client as D1Client).prepare !== 'function') {
    return null
  }
  return client as D1Client
}

function jsonColumnValue(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

export async function d1NarrowUpdate(
  payload: Payload,
  table: string,
  id: string | number,
  pairs: Array<[column: string, value: unknown]>,
): Promise<boolean> {
  const client = d1ClientFromPayload(payload)
  if (!client) return false

  const safeTable = table.replace(/`/g, '``')
  const safePairs = pairs.map(([column, value]) => [column.replace(/`/g, '``'), value] as const)
  const setSql = safePairs.map(([column]) => `\`${column}\` = ?`).join(', ')
  if (!setSql) return true

  await client
    .prepare(`UPDATE \`${safeTable}\` SET ${setSql}, \`updated_at\` = ? WHERE \`id\` = ?`)
    .bind(...safePairs.map(([, value]) => value), new Date().toISOString(), id)
    .run()
  return true
}

export async function d1NarrowUpdateArticle(
  payload: Payload,
  id: string | number,
  data: {
    body?: unknown
    excerpt?: string | null
    sectionSummaries?: unknown
  },
): Promise<boolean> {
  const pairs: Array<[string, unknown]> = []
  if ('body' in data) pairs.push(['body', jsonColumnValue(data.body)])
  if ('excerpt' in data) pairs.push(['excerpt', data.excerpt ?? null])
  if ('sectionSummaries' in data) pairs.push(['section_summaries', jsonColumnValue(data.sectionSummaries)])
  return d1NarrowUpdate(payload, 'articles', id, pairs)
}
