import type { Payload, Where } from 'payload'

export type KnowledgeMemoryRow = {
  title: string
  summary?: string | null
  entryType?: string | null
  skillId?: string | null
  subject?: string | null
}

/**
 * 合规钉子 1 — 为 LLM 上下文拼接 `knowledge-base` 摘要（等价 skill memory/*）。
 */
export async function fetchKnowledgeMemorySummaries(
  payload: Payload,
  opts: { subject?: string | null; skillId?: string | null; limit?: number },
): Promise<KnowledgeMemoryRow[]> {
  const sub = opts.subject?.trim()
  const sk = opts.skillId?.trim()
  if (!sub && !sk) return []

  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 25)
  const clauses: Where[] = []
  if (sub) clauses.push({ subject: { contains: sub } })
  if (sk) clauses.push({ skillId: { equals: sk } })

  const res = await payload.find({
    collection: 'knowledge-base',
    where: clauses.length > 1 ? { or: clauses } : clauses[0]!,
    sort: '-updatedAt',
    limit,
    depth: 0,
  })

  return res.docs.map((d) => {
    const x = d as unknown as KnowledgeMemoryRow & { id: string }
    return {
      title: x.title,
      summary: x.summary,
      entryType: x.entryType,
      skillId: x.skillId,
      subject: x.subject,
    }
  })
}

export function formatKnowledgeMemoryBlock(rows: KnowledgeMemoryRow[]): string {
  if (!rows.length) return ''
  const lines = rows.map(
    (r, i) =>
      `${i + 1}. [${r.entryType ?? 'note'}] ${r.title}${r.summary ? `: ${String(r.summary).slice(0, 400)}` : ''}`,
  )
  return `<reference_memory>\n${lines.join('\n')}\n</reference_memory>`
}
