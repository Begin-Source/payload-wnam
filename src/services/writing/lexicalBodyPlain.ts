import type { Article } from '@/payload-types'

import { markdownToPageBodyLexical } from '@/utilities/sitePagesBundleContent/markdownToPayloadLexical'
import { finalizeArticleBodyText } from '@/services/writing/finalizePass'

function collectTextChildren(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const row = node as Record<string, unknown>
  if (row.type === 'text' && typeof row.text === 'string') {
    return row.text
  }
  const raw = row.children
  if (!Array.isArray(raw)) return ''
  return raw.map((c) => collectTextChildren(c)).join('')
}

/**
 * Paragraph + heading blocks → plain lines (joined with `\n\n` for finalize pass).
 */
export function lexicalArticleBodyToPlainText(body: unknown): string {
  const root = body && typeof body === 'object' && 'root' in (body as object) ? (body as Article['body']).root : null
  if (!root || typeof root !== 'object') return ''
  const children = (root as { children?: unknown }).children
  if (!Array.isArray(children)) return ''
  const lines: string[] = []
  for (const ch of children) {
    if (!ch || typeof ch !== 'object') continue
    const row = ch as Record<string, unknown>
    const t = row.type
    if (t === 'paragraph' || t === 'heading') {
      const line = collectTextChildren(ch).replace(/\u200b/g, '').trim()
      if (line) lines.push(line)
    }
  }
  return lines.join('\n\n')
}

/** Run finalizeArticleBodyText and rebuild article Lexical body from plain text blocks. */
export function finalizeLexicalArticleBody(body: unknown): Article['body'] {
  const raw = lexicalArticleBodyToPlainText(body)
  const polished = finalizeArticleBodyText(raw)
  return markdownToPageBodyLexical(polished) as Article['body']
}
