import { describe, expect, it, vi } from 'vitest'

import type { Payload } from 'payload'

import { sectionContentHash, writeSectionIntoArticleBody } from '@/services/writing/writeSectionIntoArticleBody'
import { buildLexicalSkeleton } from '@/services/writing/skeletonBuilder'

describe('writeSectionIntoArticleBody', () => {
  it('returns anchor_not_found when skeleton has no matching dataSectionId', async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        id: 9,
        body: buildLexicalSkeleton(['wrong-id']),
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
