import type { Article } from '@/payload-types'

import { markdownToPageBodyLexical } from '@/utilities/sitePagesBundleContent/markdownToPayloadLexical'
import { finalizeArticleBodyText } from '@/services/writing/finalizePass'

const MAX_BLOCK_DEPTH = 120

function collectTextChildren(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const row = node as Record<string, unknown>
  if (row.type === 'text' && typeof row.text === 'string') {
    return row.text
  }
  if (row.type === 'linebreak') return '\n'
  const raw = row.children
  if (!Array.isArray(raw)) return ''
  return raw.map((c) => collectTextChildren(c)).join('')
}

function pushParagraphLikeLine(lines: string[], node: unknown): void {
  const line = collectTextChildren(node).replace(/\u200b/g, '').replace(/\n{3,}/g, '\n\n').trim()
  if (line) lines.push(line)
}

/**
 * Depth-first walk over Lexical blocks so list / quote / table / nested wrappers
 * contribute text (top-level-only traversal previously dropped most body content).
 */
function walkBlock(node: unknown, lines: string[], depth: number): void {
  if (depth > MAX_BLOCK_DEPTH || !node || typeof node !== 'object') return
  const row = node as Record<string, unknown>
  const t = row.type

  if (t === 'paragraph' || t === 'heading') {
    pushParagraphLikeLine(lines, node)
    return
  }

  if (t === 'listitem') {
    const inner = collectTextChildren(node).replace(/\u200b/g, '').replace(/\s+/g, ' ').trim()
    if (inner) lines.push(`- ${inner}`)
    return
  }

  if (t === 'horizontalrule') {
    return
  }

  const ch = row.children
  if (!Array.isArray(ch)) return
  for (const c of ch) walkBlock(c, lines, depth + 1)
}

/**
 * Lexical document → plain lines (joined with `\n\n` for finalize / embedding passes).
 */
export function lexicalArticleBodyToPlainText(body: unknown): string {
  const root = body && typeof body === 'object' && 'root' in (body as object) ? (body as Article['body']).root : null
  if (!root || typeof root !== 'object') return ''
  const children = (root as { children?: unknown }).children
  if (!Array.isArray(children)) return ''
  const lines: string[] = []
  for (const ch of children) {
    walkBlock(ch, lines, 0)
  }
  return lines.join('\n\n')
}

/** Run finalizeArticleBodyText and rebuild article Lexical body from plain text blocks. */
export function finalizeLexicalArticleBody(body: unknown): Article['body'] {
  const raw = lexicalArticleBodyToPlainText(body)
  const polished = finalizeArticleBodyText(raw)
  return markdownToPageBodyLexical(polished) as Article['body']
}
