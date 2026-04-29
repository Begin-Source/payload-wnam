/* eslint-disable @typescript-eslint/no-explicit-any -- Lexical serialized JSON for Payload richtext */
import type { Page } from '@/payload-types'

type TextNode = {
  type: 'text'
  text: string
  version: number
  format: number
  style: string
  mode: 'normal' | string
  detail: number
}

function textNode(s: string): TextNode {
  return {
    type: 'text',
    text: s,
    version: 1,
    format: 0,
    style: '',
    mode: 'normal',
    detail: 0,
  }
}

function paragraphWithText(s: string): any {
  const t = s.trim() || ' '
  return {
    type: 'paragraph',
    format: '',
    indent: 0,
    version: 1,
    textFormat: 0,
    textStyle: '',
    children: [textNode(t)],
    direction: 'ltr',
  }
}

/**
 * Map `#`–`######` to Lexical `heading` (Payload default richtext feature set).
 */
function headingNode(tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', text: string): any {
  return {
    type: 'heading',
    tag,
    format: '',
    indent: 0,
    version: 1,
    textFormat: 0,
    textStyle: '',
    children: [textNode(text.trim())],
    direction: 'ltr',
  }
}

const HEADING_RE = /^(#{1,6})\s+(.+)$/

/**
 * Minimal Markdown to Lexical (headings, paragraphs, bullet lines as separate paragraphs with •).
 */
export function markdownToPageBodyLexical(md: string): Page['body'] {
  const lines = String(md || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
  const children: any[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) continue
    const h = HEADING_RE.exec(trimmed)
    if (h) {
      const level = h[1].length
      const text = h[2]
      const tag = (`h${Math.min(level, 6)}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6')
      children.push(headingNode(tag, text))
      continue
    }
    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const rest = trimmed.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '')
      children.push(paragraphWithText(`• ${rest}`))
      continue
    }
    children.push(paragraphWithText(trimmed))
  }
  if (children.length === 0) {
    children.push(paragraphWithText(' '))
  }
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children,
    },
  } as Page['body']
}
