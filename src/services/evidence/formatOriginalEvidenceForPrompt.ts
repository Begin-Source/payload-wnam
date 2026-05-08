import type { Payload } from 'payload'

/** Minimal shape for formatting; matches populated `original-evidence` rows from Payload `find`. */
export type OriginalEvidencePromptDoc = {
  kind: string
  capturedAt?: string | null
  notes?: string | null
  media?: number | { filename?: string | null; alt?: string | null; url?: string | null } | null
}

const DEFAULT_MAX_ITEMS = 8
const DEFAULT_MAX_CHARS = 2200
const NOTES_MAX = 200
const ALT_MAX = 80

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, Math.max(0, max - 1))}…`
}

export function formatSingleEvidenceLine(doc: OriginalEvidencePromptDoc): string {
  const parts: string[] = [`kind=${doc.kind}`]
  if (typeof doc.capturedAt === 'string' && doc.capturedAt.trim()) {
    parts.push(`capturedAt=${doc.capturedAt.trim()}`)
  }
  const m = doc.media
  if (m != null && typeof m === 'object') {
    if (typeof m.filename === 'string' && m.filename.trim()) {
      parts.push(`file=${m.filename.trim()}`)
    }
    if (typeof m.url === 'string' && m.url.trim()) {
      parts.push(`url=${m.url.trim()}`)
    }
    if (typeof m.alt === 'string' && m.alt.trim()) {
      parts.push(`alt=${truncate(m.alt.trim(), ALT_MAX)}`)
    }
  } else if (typeof m === 'number' && Number.isFinite(m)) {
    parts.push(`mediaId=${m}`)
  }
  if (typeof doc.notes === 'string' && doc.notes.trim()) {
    parts.push(`notes=${truncate(doc.notes.trim(), NOTES_MAX)}`)
  }
  return parts.join(' | ')
}

/**
 * Bullet list for LLM context. Returns empty string if nothing usable.
 */
export function formatOriginalEvidenceDocsForPrompt(
  docs: OriginalEvidencePromptDoc[],
  opts?: { maxItems?: number; maxChars?: number },
): string {
  const maxItems = Math.max(1, Math.floor(opts?.maxItems ?? DEFAULT_MAX_ITEMS))
  const maxChars = Math.max(200, Math.floor(opts?.maxChars ?? DEFAULT_MAX_CHARS))
  const slice = docs.slice(0, maxItems)
  const lines: string[] = []
  for (const doc of slice) {
    const line = formatSingleEvidenceLine(doc)
    if (!line.trim()) continue
    lines.push(`- ${line}`)
  }
  if (lines.length === 0) return ''
  let out = lines.join('\n')
  if (out.length > maxChars) out = truncate(out, maxChars)
  return out
}

/** Appended to draft prompts after editor context / globalContext (skipped when slice is empty). */
export const ORIGINAL_EVIDENCE_PROMPT_HEADER =
  'First-hand evidence (editor-provided; cite only facts listed below; do not invent receipts, benchmarks, or unseen imagery):'

export function buildOriginalEvidenceContextAppendix(slice: string): string {
  const s = slice.trim()
  if (!s) return ''
  return `\n\n---\n${ORIGINAL_EVIDENCE_PROMPT_HEADER}\n${s}`
}

export async function loadOriginalEvidencePromptSlice(
  payload: Payload,
  articleId: number,
  opts?: { maxItems?: number; maxChars?: number },
): Promise<string> {
  if (!Number.isFinite(articleId)) return ''
  const maxItems = Math.max(1, Math.floor(opts?.maxItems ?? DEFAULT_MAX_ITEMS))
  try {
    const res = await payload.find({
      collection: 'original-evidence',
      where: { article: { equals: articleId } },
      depth: 1,
      limit: maxItems,
      sort: '-capturedAt',
      overrideAccess: true,
    })
    const docs = res.docs as OriginalEvidencePromptDoc[]
    return formatOriginalEvidenceDocsForPrompt(docs, opts)
  } catch {
    return ''
  }
}
