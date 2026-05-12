/* eslint-disable @typescript-eslint/no-explicit-any -- Lexical serialized JSON for Payload richtext */
import type { Page } from '@/payload-types'

type TextNode = {
  type: 'text'
  text: string
  version: number
  format: number
  style: string
  mode: 'normal'
  detail: number
}

type LineBreakNode = {
  type: 'linebreak'
  version: 1
}

type InlineNode = TextNode | LineBreakNode | Record<string, unknown>
type ListKind = 'bullet' | 'number' | 'check'

type ParagraphSegment = {
  text: string
  hardBreak: boolean
}

type ParsedListLine = {
  indent: number
  kind: ListKind
  text: string
  value: number
  checked?: boolean
}

const TEXT_FORMAT = {
  bold: 1,
  italic: 2,
  strikethrough: 4,
  underline: 8,
  code: 16,
} as const

const HEADING_RE = /^(#{1,6})\s+(.+)$/
const ORDERED_LIST_RE = /^(\s*)(\d+)\.\s+(.+)$/
const UNORDERED_LIST_RE = /^(\s*)[-*+]\s+(.+)$/
const CHECK_LIST_RE = /^(\s*)[-*+]\s+\[( |x|X)\]\s+(.+)$/
const BLOCKQUOTE_RE = /^>\s?(.*)$/
const TABLE_ROW_RE = /^\|(.+)\|\s?$/
const TABLE_DIVIDER_RE = /^(\| ?:?-*:? ?)+\|\s?$/
const CODE_FENCE_RE = /^```([^\s`]+)?\s*$/
const HR_RE = /^([-*_])\1\1+(?:\s*\1\1+)*\s*$/
const HARD_BREAK_RE = /(?:<br\s*\/?>| {2,})\s*$/i
const INLINE_BR_RE = /<br\s*\/?>/i
const LIST_INDENT_SIZE = 4

function textNode(text: string, format = 0): TextNode {
  return {
    type: 'text',
    text,
    version: 1,
    format,
    style: '',
    mode: 'normal',
    detail: 0,
  }
}

function linebreakNode(): LineBreakNode {
  return { type: 'linebreak', version: 1 }
}

function mergeTextNodes(nodes: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = []
  for (const node of nodes) {
    const prev = out[out.length - 1]
    if (
      prev &&
      node &&
      typeof prev === 'object' &&
      typeof node === 'object' &&
      (prev as Record<string, unknown>).type === 'text' &&
      (node as Record<string, unknown>).type === 'text'
    ) {
      const prevText = (prev as TextNode).text
      const nextText = (node as TextNode).text
      const sameFormat = (prev as TextNode).format === (node as TextNode).format
      if (sameFormat) {
        ;(prev as TextNode).text = `${prevText}${nextText}`
        continue
      }
    }
    out.push(node)
  }
  return out
}

function parseFormattedText(text: string): InlineNode[] {
  const source = String(text || '')
  if (!source) return [textNode(' ')]

  const tokens = [
    { kind: 'code' as const, re: /`([^`\n]+)`/g, format: TEXT_FORMAT.code, priority: 0 },
    { kind: 'bold' as const, re: /\*\*([^*\n]+)\*\*/g, format: TEXT_FORMAT.bold, priority: 1 },
    { kind: 'strikethrough' as const, re: /~~([^~\n]+)~~/g, format: TEXT_FORMAT.strikethrough, priority: 2 },
    { kind: 'italic' as const, re: /\*([^*\n]+)\*/g, format: TEXT_FORMAT.italic, priority: 3 },
  ]

  const nodes: InlineNode[] = []
  let cursor = 0

  while (cursor < source.length) {
    let best: {
      kind: (typeof tokens)[number]['kind']
      start: number
      end: number
      inner: string
      format: number
      priority: number
    } | null = null

    for (const token of tokens) {
      token.re.lastIndex = cursor
      const match = token.re.exec(source)
      if (!match || match.index == null) continue
      const start = match.index
      const end = start + match[0].length
      if (!best || start < best.start || (start === best.start && token.priority < best.priority)) {
        best = {
          kind: token.kind,
          start,
          end,
          inner: match[1] ?? '',
          format: token.format,
          priority: token.priority,
        }
      }
    }

    if (!best) {
      nodes.push(textNode(source.slice(cursor)))
      break
    }

    if (best.start > cursor) {
      nodes.push(textNode(source.slice(cursor, best.start)))
    }

    nodes.push(textNode(best.inner, best.format))
    cursor = best.end
  }

  return mergeTextNodes(nodes)
}

function createLinkNode(url: string, children: InlineNode[], id: string): any {
  return {
    type: 'link',
    id,
    fields: {
      doc: null,
      linkType: 'custom',
      newTab: false,
      url: url.trim(),
    },
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 3,
  }
}

function parseInline(text: string, linkCounter: { value: number }): InlineNode[] {
  const source = String(text || '')
  if (!source.trim()) return [textNode(' ')]

  const nodes: InlineNode[] = []
  const chunks = source.split(INLINE_BR_RE)

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex] ?? ''
    let cursor = 0
    const linkRe = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

    while (cursor < chunk.length) {
      linkRe.lastIndex = cursor
      const match = linkRe.exec(chunk)
      if (!match || match.index == null) {
        nodes.push(...parseFormattedText(chunk.slice(cursor)))
        break
      }

      if (match.index > cursor) {
        nodes.push(...parseFormattedText(chunk.slice(cursor, match.index)))
      }

      const label = match[1] ?? ''
      const url = match[2] ?? ''
      nodes.push(createLinkNode(url, parseFormattedText(label), `link-${linkCounter.value++}`))
      cursor = match.index + match[0].length
    }

    if (chunkIndex < chunks.length - 1) {
      nodes.push(linebreakNode())
    }
  }

  return mergeTextNodes(nodes)
}

function paragraphNode(children: InlineNode[]): any {
  return {
    type: 'paragraph',
    format: '',
    indent: 0,
    version: 1,
    textFormat: 0,
    textStyle: '',
    children: children.length > 0 ? children : [textNode(' ')],
    direction: 'ltr',
  }
}

function headingNode(tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', children: InlineNode[]): any {
  return {
    type: 'heading',
    tag,
    format: '',
    indent: 0,
    version: 1,
    textFormat: 0,
    textStyle: '',
    children: children.length > 0 ? children : [textNode(' ')],
    direction: 'ltr',
  }
}

function quoteNode(children: any[]): any {
  return {
    type: 'quote',
    format: '',
    indent: 0,
    version: 1,
    children: children.length > 0 ? children : [paragraphNode([textNode(' ')])],
    direction: 'ltr',
  }
}

function horizontalRuleNode(): any {
  return {
    type: 'horizontalrule',
    version: 1,
  }
}

function codeNode(language: string | undefined, lines: string[]): any {
  const children: any[] = []
  if (lines.length === 0) {
    children.push(textNode(''))
  } else {
    lines.forEach((line, index) => {
      children.push(textNode(line))
      if (index < lines.length - 1) {
        children.push(linebreakNode())
      }
    })
  }
  return {
    type: 'code',
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    language: language || undefined,
    version: 1,
  }
}

function listItemNode(children: InlineNode[], value: number, checked?: boolean): any {
  const item: Record<string, unknown> = {
    type: 'listitem',
    children: [paragraphNode(children)],
    direction: 'ltr',
    format: '',
    indent: 0,
    value,
    version: 1,
  }
  if (typeof checked === 'boolean') item.checked = checked
  return item
}

function listNode(listType: ListKind, children: any[], start = 1): any {
  return {
    type: 'list',
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    listType,
    start,
    tag: listType === 'number' ? 'ol' : 'ul',
    version: 1,
  }
}

function tableCellNode(text: string, headerState = 0, linkCounter: { value: number }): any {
  return {
    type: 'tablecell',
    children: [paragraphNode(parseInline(text, linkCounter))],
    direction: 'ltr',
    format: '',
    indent: 0,
    headerState,
    version: 1,
  }
}

function tableRowNode(children: any[]): any {
  return {
    type: 'tablerow',
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  }
}

function tableNode(children: any[]): any {
  return {
    type: 'table',
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  }
}

function rootNode(children: any[]): Page['body'] {
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: children.length > 0 ? children : [paragraphNode([textNode(' ')])],
    },
  } as Page['body']
}

function getIndentLevel(whitespace: string): number {
  const expanded = whitespace.replace(/\t/g, ' '.repeat(LIST_INDENT_SIZE))
  return Math.floor(expanded.length / LIST_INDENT_SIZE)
}

function parseListLine(line: string): ParsedListLine | null {
  const checkMatch = CHECK_LIST_RE.exec(line)
  if (checkMatch) {
    return {
      indent: getIndentLevel(checkMatch[1] ?? ''),
      kind: 'check',
      text: checkMatch[3] ?? '',
      value: 1,
      checked: (checkMatch[2] ?? '').toLowerCase() === 'x',
    }
  }

  const orderedMatch = ORDERED_LIST_RE.exec(line)
  if (orderedMatch) {
    return {
      indent: getIndentLevel(orderedMatch[1] ?? ''),
      kind: 'number',
      text: orderedMatch[3] ?? '',
      value: Number(orderedMatch[2] ?? '1') || 1,
    }
  }

  const unorderedMatch = UNORDERED_LIST_RE.exec(line)
  if (unorderedMatch) {
    return {
      indent: getIndentLevel(unorderedMatch[1] ?? ''),
      kind: 'bullet',
      text: unorderedMatch[2] ?? '',
      value: 1,
    }
  }

  return null
}

function parseTableCells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const protectedPipes = inner.replace(/\\\|/g, '\u0000PIPE\u0000')
  return protectedPipes
    .split('|')
    .map((cell) => cell.replace(/\u0000PIPE\u0000/g, '|').trim())
}

function emitParagraph(segments: ParagraphSegment[], out: any[], linkCounter: { value: number }): void {
  if (!segments.length) return
  const children: InlineNode[] = []
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const text = segment.text.replace(/\u200b/g, '')
    if (text) children.push(...parseInline(text, linkCounter))
    if (i < segments.length - 1) {
      children.push(segment.hardBreak ? linebreakNode() : textNode(' '))
    }
  }
  out.push(paragraphNode(children))
  segments.length = 0
}

function emitQuote(lines: string[], out: any[], linkCounter: { value: number }): void {
  if (!lines.length) return
  const quoteBlocks: any[] = []
  const paragraphLines: ParagraphSegment[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      emitParagraph(paragraphLines, quoteBlocks, linkCounter)
      continue
    }
    paragraphLines.push({
      text: trimmed.replace(HARD_BREAK_RE, '').trimEnd(),
      hardBreak: HARD_BREAK_RE.test(trimmed),
    })
  }

  emitParagraph(paragraphLines, quoteBlocks, linkCounter)
  out.push(quoteNode(quoteBlocks))
  lines.length = 0
}

function parseListBlock(
  lines: string[],
  startIndex: number,
  linkCounter: { value: number },
): { node: any; nextIndex: number } | null {
  const first = parseListLine(lines[startIndex] ?? '')
  if (!first) return null

  const baseIndent = first.indent
  const baseKind = first.kind
  const items: any[] = []
  let index = startIndex
  let currentItem: any = null

  while (index < lines.length) {
    const rawLine = lines[index] ?? ''
    if (!rawLine.trim()) break

    const parsed = parseListLine(rawLine)
    if (!parsed) break
    if (parsed.indent < baseIndent) break
    if (parsed.indent > baseIndent) {
      if (!currentItem) break
      const nested = parseListBlock(lines, index, linkCounter)
      if (!nested) break
      currentItem.children.push(nested.node)
      index = nested.nextIndex
      continue
    }
    if (parsed.kind !== baseKind) break

    currentItem = listItemNode(parseInline(parsed.text, linkCounter), parsed.value, parsed.checked)
    items.push(currentItem)
    index += 1

    while (index < lines.length) {
      const nextRaw = lines[index] ?? ''
      if (!nextRaw.trim()) break
      const nextParsed = parseListLine(nextRaw)
      if (!nextParsed || nextParsed.indent <= baseIndent) break
      const nested = parseListBlock(lines, index, linkCounter)
      if (!nested) break
      currentItem.children.push(nested.node)
      index = nested.nextIndex
    }
  }

  return {
    node: listNode(baseKind, items, first.value),
    nextIndex: index,
  }
}

function parseTableBlock(
  lines: string[],
  startIndex: number,
  linkCounter: { value: number },
): { node: any; nextIndex: number } | null {
  const headerLine = lines[startIndex] ?? ''
  const dividerLine = lines[startIndex + 1] ?? ''
  if (!TABLE_ROW_RE.test(headerLine) || !TABLE_DIVIDER_RE.test(dividerLine.trim())) return null

  const rows: any[] = []
  let index = startIndex
  let isHeaderRow = true

  while (index < lines.length) {
    const rawLine = lines[index] ?? ''
    if (!TABLE_ROW_RE.test(rawLine.trim())) break

    const cells = parseTableCells(rawLine)
    rows.push(tableRowNode(cells.map((cell) => tableCellNode(cell, isHeaderRow ? 1 : 0, linkCounter))))

    index += 1
    if (isHeaderRow) {
      if (TABLE_DIVIDER_RE.test((lines[index] ?? '').trim())) {
        index += 1
      }
      isHeaderRow = false
    }
  }

  return {
    node: tableNode(rows),
    nextIndex: index,
  }
}

/**
 * Markdown to Payload Lexical.
 *
 * Supports the structural nodes our article pipeline emits:
 * headings, paragraphs, blockquotes, ordered/unordered/check lists,
 * nested lists, tables, fenced code blocks, horizontal rules,
 * bold/italic/strikethrough/code text spans, inline links, and line breaks.
 */
export function markdownToPageBodyLexical(md: string): Page['body'] {
  const lines = String(md || '')
    .replace(/\r\n/g, '\n')
    .split('\n')

  const children: any[] = []
  const paragraphSegments: ParagraphSegment[] = []
  const quoteLines: string[] = []
  const linkCounter = { value: 0 }
  let inCodeBlock = false
  let codeLanguage: string | undefined
  let codeLines: string[] = []

  const flushParagraph = () => emitParagraph(paragraphSegments, children, linkCounter)
  const flushQuote = () => emitQuote(quoteLines, children, linkCounter)
  const flushCode = () => {
    if (!inCodeBlock) return
    children.push(codeNode(codeLanguage, codeLines))
    inCodeBlock = false
    codeLanguage = undefined
    codeLines = []
  }

  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index] ?? ''
    const line = rawLine.replace(/\t/g, ' '.repeat(LIST_INDENT_SIZE))
    const trimmed = line.trim()

    if (inCodeBlock) {
      if (/^\s*```(?:\s*)$/.test(trimmed)) {
        flushCode()
        continue
      }
      codeLines.push(rawLine.replace(/\r/g, ''))
      continue
    }

    if (!trimmed) {
      flushParagraph()
      flushQuote()
      continue
    }

    const singleLineCodeMatch = /^```(?:([^\s`]+)\s+)?([\s\S]*?)```$/.exec(trimmed)
    if (singleLineCodeMatch) {
      flushParagraph()
      flushQuote()
      children.push(codeNode(singleLineCodeMatch[1] || undefined, [singleLineCodeMatch[2] ?? '']))
      continue
    }

    const codeMatch = CODE_FENCE_RE.exec(trimmed)
    if (codeMatch) {
      flushParagraph()
      flushQuote()
      inCodeBlock = true
      codeLanguage = codeMatch[1] || undefined
      codeLines = []
      continue
    }

    const headingMatch = HEADING_RE.exec(trimmed)
    if (headingMatch) {
      flushParagraph()
      flushQuote()
      const level = Math.min(headingMatch[1].length, 6)
      children.push(headingNode(`h${level}` as any, parseInline(headingMatch[2] ?? '', linkCounter)))
      continue
    }

    if (HR_RE.test(trimmed)) {
      flushParagraph()
      flushQuote()
      children.push(horizontalRuleNode())
      continue
    }

    const tableBlock = parseTableBlock(lines, index, linkCounter)
    if (tableBlock) {
      flushParagraph()
      flushQuote()
      children.push(tableBlock.node)
      index = tableBlock.nextIndex - 1
      continue
    }

    const quoteMatch = BLOCKQUOTE_RE.exec(trimmed)
    if (quoteMatch) {
      flushParagraph()
      const content = (quoteMatch[1] ?? '').replace(HARD_BREAK_RE, '').trimEnd()
      quoteLines.push(content)
      continue
    }

    const listMatch = parseListLine(line)
    if (listMatch) {
      flushParagraph()
      flushQuote()
      const listBlock = parseListBlock(lines, index, linkCounter)
      if (listBlock) {
        children.push(listBlock.node)
        index = listBlock.nextIndex - 1
        continue
      }
    }

    flushQuote()
    const hardBreak = HARD_BREAK_RE.test(rawLine)
    paragraphSegments.push({
      text: rawLine.replace(/\r/g, '').replace(HARD_BREAK_RE, '').trimEnd(),
      hardBreak,
    })
  }

  flushParagraph()
  flushQuote()
  flushCode()

  return rootNode(children)
}
