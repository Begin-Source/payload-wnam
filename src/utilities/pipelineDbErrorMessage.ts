import { truncateErrorMessage } from '@/utilities/mediaAiImagePrompt'

/** Walk `Error.cause` (and shallow `message`) for D1/sqlite failure text. */
export function extractPipelineErrorChainMessage(e: unknown): string {
  const parts: string[] = []
  let cur: unknown = e
  const seen = new Set<unknown>()
  for (let depth = 0; cur != null && depth < 6; depth++) {
    if (seen.has(cur)) break
    seen.add(cur)
    if (cur instanceof Error) {
      if (cur.message) parts.push(cur.message)
      cur = (cur as Error & { cause?: unknown }).cause
      continue
    }
    if (typeof cur === 'object' && cur !== null && 'message' in cur) {
      const m = (cur as { message: unknown }).message
      if (typeof m === 'string' && m.trim()) parts.push(m.trim())
    }
    break
  }
  return parts.join(' | ') || String(e)
}

/**
 * Appends actionable hint when SQLite/D1 insert into `media` fails (FK drift / tenant).
 */
export function formatD1MediaInsertFailureMessage(e: unknown): string {
  const raw = extractPipelineErrorChainMessage(e)
  const base = truncateErrorMessage(raw, 480)
  const lower = raw.toLowerCase()
  if (
    lower.includes('failed query') ||
    lower.includes('sqlite') ||
    lower.includes('constraint') ||
    lower.includes('foreign key')
  ) {
    return `${base} — 若为 media 插入失败：检查 PRAGMA foreign_key_list(media)、sites.tenant_id 是否在 tenants 中存在；若 site_id 指向备份表需迁移 20260721_repair_media_site_id_fk_to_sites`
  }
  return base
}
