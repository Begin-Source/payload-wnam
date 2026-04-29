import { describe, expect, it } from 'vitest'

import { extractLinksFromLexical } from '@/services/linkgraph/ingest'

const ctx = { fromCollection: 'articles', fromId: '99' }

describe('extractLinksFromLexical', () => {
  it('should parse internal Payload link (fields.doc)', () => {
    const lexical = {
      root: {
        type: 'root',
        children: [
          {
            type: 'link',
            fields: { doc: { relationTo: 'articles', value: 42 } },
            children: [{ type: 'text', text: 'Peer post' }],
          },
        ],
      },
    }
    const edges = extractLinksFromLexical(lexical, ctx)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      fromCollection: 'articles',
      fromId: '99',
      toCollection: 'articles',
      toId: '42',
      anchorText: 'Peer post',
      location: 'body',
    })
  })

  it('should parse custom URL link', () => {
    const lexical = {
      root: {
        type: 'root',
        children: [
          {
            type: 'link',
            fields: { url: 'https://example.com/path' },
            children: [{ type: 'text', text: 'Example' }],
          },
        ],
      },
    }
    const edges = extractLinksFromLexical(lexical, ctx)
    expect(edges).toHaveLength(1)
    expect(edges[0]?.toCollection).toBe('external')
    expect(edges[0]?.toExternal).toBe('https://example.com/path')
    expect(edges[0]?.toId).toHaveLength(32)
  })

  it('should dedupe identical links', () => {
    const link = {
      type: 'link',
      fields: { url: 'https://a.com' },
      children: [{ type: 'text', text: 'A' }],
    }
    const lexical = {
      root: {
        type: 'root',
        children: [link, link],
      },
    }
    expect(extractLinksFromLexical(lexical, ctx)).toHaveLength(1)
  })
})
