import { describe, expect, it, vi } from 'vitest'

import type { Payload } from 'payload'

import {
  findSectionAnchorInTree,
  healInsertIndexAtRootLevel,
  sectionContentHash,
  topLevelSectionPlaceholderIndex,
  writeSectionIntoArticleBody,
} from '@/services/writing/writeSectionIntoArticleBody'
import { buildLexicalSkeleton } from '@/services/writing/skeletonBuilder'
import { markdownToPageBodyLexical } from '@/utilities/sitePagesBundleContent/markdownToPayloadLexical'

describe('healInsertIndexAtRootLevel', () => {
  it('inserts body before top-level faq placeholder', () => {
    const sk = buildLexicalSkeleton(['intro', 'faq'])
    const rootChildren = (sk.root as { children: unknown[] }).children
    const idx = healInsertIndexAtRootLevel(rootChildren, 'body', ['intro', 'body', 'faq', 'conclusion'])
    const faqTop = topLevelSectionPlaceholderIndex(rootChildren, 'faq')
    expect(idx).toBe(faqTop)
  })
})

describe('findSectionAnchorInTree', () => {
  it('finds nested paragraph anchors', () => {
    const intro = {
      type: 'paragraph',
      format: '',
      dataSectionId: 'intro',
      children: [{ type: 'text', text: '<!-- section:intro -->', version: 1 }],
      version: 1,
    }
    const tree = [
      {
        type: 'quote',
        children: [intro],
        version: 1,
      },
    ]
    const loc = findSectionAnchorInTree(tree, 'intro')
    expect(loc).not.toBeNull()
    expect(loc?.parent).toBe((tree[0] as { children: unknown[] }).children)
    expect(loc?.index).toBe(0)
  })
})

describe('writeSectionIntoArticleBody', () => {
  it('returns anchor_not_found when placeholder exists outside any paragraph', async () => {
    const body = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'no marker', version: 1 }],
            version: 1,
          },
        ],
        version: 1,
        decorator: '<!-- section:intro -->',
      },
    }
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        id: 9,
        body,
        sectionSummaries: {},
      }),
      update: vi.fn(),
      logger: { warn: vi.fn() },
    } as unknown as Payload

    const r = await writeSectionIntoArticleBody(payload, {
      articleId: 9,
      sectionId: 'intro',
      sectionMarkdown: 'hello',
    })

    expect(r).toEqual({ ok: false, reason: 'anchor_not_found' })
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('heal-inserts at root end when briefId omitted and no ordered hint', async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        id: 9,
        body: buildLexicalSkeleton(['wrong-id']),
        sectionSummaries: {},
      }),
      update: vi.fn().mockResolvedValue({}),
      logger: { warn: vi.fn() },
    } as unknown as Payload

    const r = await writeSectionIntoArticleBody(payload, {
      articleId: 9,
      sectionId: 'intro',
      sectionMarkdown: 'hello',
    })

    expect(r).toEqual({ ok: true })
    expect(payload.update).toHaveBeenCalledTimes(1)
    expect(vi.mocked(payload.logger.warn).mock.calls.some((c) => String(c[0]).includes('heal-insert'))).toBe(true)
  })

  it('heal-inserts body before faq when brief lists canonical order', async () => {
    const sk = buildLexicalSkeleton(['intro', 'faq'])
    const payload = {
      findByID: vi.fn((args: { collection: string }) => {
        if (args.collection === 'articles') {
          return Promise.resolve({
            id: 9,
            body: sk,
            sectionSummaries: {},
          })
        }
        if (args.collection === 'content-briefs') {
          return Promise.resolve({
            outline: {
              sections: [
                { id: 'intro', type: 'intro' },
                { id: 'body', type: 'custom' },
                { id: 'faq', type: 'faq' },
                { id: 'conclusion', type: 'conclusion' },
              ],
            },
          })
        }
        return Promise.resolve(null)
      }),
      update: vi.fn().mockResolvedValue({}),
      logger: { warn: vi.fn() },
    } as unknown as Payload

    const r = await writeSectionIntoArticleBody(payload, {
      articleId: 9,
      sectionId: 'body',
      sectionMarkdown: '## Main body\n\nParagraph.',
      briefId: 1,
    })

    expect(r).toEqual({ ok: true })
    const upd = vi.mocked(payload.update).mock.calls[0]?.[0] as {
      data?: { body?: { root?: { children?: unknown[] } } }
    }
    const ch = upd.data?.body?.root?.children ?? []
    const faqIdx = ch.findIndex(
      (n) => n && typeof n === 'object' && JSON.stringify(n).includes('<!-- section:faq -->'),
    )
    const mainIdx = ch.findIndex(
      (n) => n && typeof n === 'object' && JSON.stringify(n).includes('Main body'),
    )
    expect(faqIdx).toBeGreaterThan(-1)
    expect(mainIdx).toBeGreaterThan(-1)
    expect(mainIdx).toBeLessThan(faqIdx)
  })

  it('succeeds without update when section summary already recorded (idempotent)', async () => {
    const prevMd = 'Previously merged intro text.'
    const excerpt = prevMd.replace(/\s+/g, ' ').trim().slice(0, 420)
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        id: 7,
        body: markdownToPageBodyLexical(prevMd),
        sectionSummaries: {
          intro: {
            writtenAt: '2026-01-01T00:00:00.000Z',
            excerpt,
            hash: sectionContentHash(prevMd.trim()),
          },
        },
      }),
      update: vi.fn(),
      logger: { warn: vi.fn() },
    } as unknown as Payload

    const r = await writeSectionIntoArticleBody(payload, {
      articleId: 7,
      sectionId: 'intro',
      sectionMarkdown: prevMd,
    })

    expect(r).toEqual({ ok: true })
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('heal-inserts when anchor missing, writtenAt is stale, and body has no extractable text', async () => {
    const payload = {
      findByID: vi.fn((args: { collection: string }) => {
        if (args.collection === 'articles') {
          return Promise.resolve({
            id: 8,
            body: { root: { type: 'root', children: [], version: 1 } },
            sectionSummaries: {
              intro: {
                writtenAt: '2026-01-01T00:00:00.000Z',
                excerpt: 'content that is no longer in body',
                hash: '999',
              },
            },
          })
        }
        if (args.collection === 'content-briefs') {
          return Promise.resolve({
            outline: {
              sections: [
                { id: 'intro', type: 'intro' },
                { id: 'body', type: 'custom' },
                { id: 'faq', type: 'faq' },
                { id: 'conclusion', type: 'conclusion' },
              ],
            },
          })
        }
        return Promise.resolve(null)
      }),
      update: vi.fn().mockResolvedValue({}),
      logger: { warn: vi.fn() },
    } as unknown as Payload

    const r = await writeSectionIntoArticleBody(payload, {
      articleId: 8,
      sectionId: 'intro',
      sectionMarkdown: '## Recovered intro\n\nParagraph.',
      briefId: 1,
    })

    expect(r).toEqual({ ok: true })
    expect(payload.update).toHaveBeenCalledTimes(1)
  })

  it('matches skeleton by comment when dataSectionId was stripped', async () => {
    const lexical = buildLexicalSkeleton(['faq'])
    const children = (lexical.root as { children: Record<string, unknown>[] }).children
    const para = children.find(
      (c) => c.type === 'paragraph' && Array.isArray(c.children),
    ) as Record<string, unknown> | undefined
    const faqPara = children.find(
      (c) => c !== para && c.type === 'paragraph',
    ) as Record<string, unknown>
    delete faqPara.dataSectionId

    const payload = {
      findByID: vi.fn().mockResolvedValue({
        id: 3,
        body: lexical,
        sectionSummaries: { globalContext: 'ctx' },
      }),
      update: vi.fn().mockResolvedValue({}),
      logger: { warn: vi.fn() },
    } as unknown as Payload

    const r = await writeSectionIntoArticleBody(payload, {
      articleId: 3,
      sectionId: 'faq',
      sectionMarkdown: '## FAQ\n\nQ? A.',
    })

    expect(r).toEqual({ ok: true })
    expect(payload.update).toHaveBeenCalledTimes(1)
  })

  it('replaces placeholder paragraph and merges sectionSummaries', async () => {
    const lexical = buildLexicalSkeleton(['faq'])
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        id: 2,
        body: lexical,
        sectionSummaries: { globalContext: 'ctx' },
      }),
      update: vi.fn().mockResolvedValue({}),
      logger: { warn: vi.fn() },
    } as unknown as Payload

    const r = await writeSectionIntoArticleBody(payload, {
      articleId: 2,
      sectionId: 'faq',
      sectionMarkdown: '## Heading\n\nParagraph one.',
    })

    expect(r).toEqual({ ok: true })
    expect(payload.update).toHaveBeenCalledTimes(1)
    const upd = vi.mocked(payload.update).mock.calls[0]?.[0] as {
      data?: { sectionSummaries?: Record<string, unknown> }
    }
    expect(upd.data?.sectionSummaries?.globalContext).toBe('ctx')
    expect(typeof (upd.data?.sectionSummaries as Record<string, { hash?: string }>).faq?.hash).toBe('string')
  })
})

describe('sectionContentHash', () => {
  it('returns stable numeric string for identical input', () => {
    expect(sectionContentHash('abc')).toBe(sectionContentHash('abc'))
    expect(sectionContentHash('abc')).not.toBe(sectionContentHash('abd'))
  })
})
