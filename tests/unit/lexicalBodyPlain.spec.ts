import { describe, expect, it } from 'vitest'

import type { Article } from '@/payload-types'

import {
  finalizeLexicalArticleBody,
  lexicalArticleBodyToPlainText,
} from '@/services/writing/lexicalBodyPlain'
import { markdownToPageBodyLexical } from '@/utilities/sitePagesBundleContent/markdownToPayloadLexical'

describe('lexicalBodyPlain', () => {
  it('extracts paragraphs and headings then round-trips finalize', () => {
    const body = markdownToPageBodyLexical('# One\n\nLine two.') as Article['body']
    const plain = lexicalArticleBodyToPlainText(body)
    expect(plain.includes('One')).toBe(true)
    const finalized = finalizeLexicalArticleBody(body)
    expect(finalized.root && typeof finalized.root === 'object').toBe(true)
  })

  it('extracts text inside blockquote and bullet list', () => {
    const md = ['# Title', '', '> Quote line here.', '', '- Item one', '- Item two'].join('\n')
    const body = markdownToPageBodyLexical(md) as Article['body']
    const plain = lexicalArticleBodyToPlainText(body)
    expect(plain).toContain('Title')
    expect(plain).toContain('Quote line here')
    expect(plain).toMatch(/Item one/)
    expect(plain).toMatch(/Item two/)
  })

  it('uses Payload-style list, link, and text-format nodes', () => {
    const body = markdownToPageBodyLexical(
      '## Title\n\n- one\n- two\n\nThis is **bold** and [link](https://example.com).',
    ) as Article['body']
    const rootChildren = (body.root as { children?: unknown[] }).children ?? []

    const listNode = rootChildren.find((node) => node && typeof node === 'object' && (node as { type?: string }).type === 'list') as
      | Record<string, unknown>
      | undefined
    expect(listNode?.listType).toBe('bullet')
    expect(listNode?.tag).toBe('ul')

    const serialized = JSON.stringify(body)
    expect(serialized).toContain('"type":"link"')
    expect(serialized).toContain('"url":"https://example.com"')
    expect(serialized).toContain('"text":"bold"')
    expect(serialized).toContain('"format":1')
  })

  it('emits nested lists, tables, code blocks, and horizontal rules', () => {
    const md = [
      '- Parent',
      '    - Child',
      '',
      '```ts',
      'const value = 1',
      'console.log(value)',
      '```',
      '',
      '| Name | Value |',
      '| --- | --- |',
      '| A | B |',
      '',
      '---',
    ].join('\n')

    const body = markdownToPageBodyLexical(md) as Article['body']
    const rootChildren = (body.root as { children?: unknown[] }).children ?? []

    const listNode = rootChildren.find((node) => node && typeof node === 'object' && (node as { type?: string }).type === 'list') as
      | Record<string, unknown>
      | undefined
    const firstListItem = (listNode?.children as Record<string, unknown>[] | undefined)?.[0]
    const nestedList = (firstListItem?.children as Record<string, unknown>[] | undefined)?.find(
      (node) => node && typeof node === 'object' && (node as { type?: string }).type === 'list',
    ) as Record<string, unknown> | undefined

    expect(nestedList?.listType).toBe('bullet')
    expect(nestedList?.tag).toBe('ul')

    const codeNode = rootChildren.find((node) => node && typeof node === 'object' && (node as { type?: string }).type === 'code') as
      | Record<string, unknown>
      | undefined
    expect(codeNode?.language).toBe('ts')
    expect(JSON.stringify(codeNode)).toContain('"type":"linebreak"')

    const tableNode = rootChildren.find((node) => node && typeof node === 'object' && (node as { type?: string }).type === 'table') as
      | Record<string, unknown>
      | undefined
    expect(tableNode?.children?.length).toBe(2)
    expect(JSON.stringify(tableNode)).toContain('"headerState":1')

    expect(rootChildren.some((node) => node && typeof node === 'object' && (node as { type?: string }).type === 'horizontalrule')).toBe(true)
  })
})
