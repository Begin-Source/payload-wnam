import { describe, expect, it, vi } from 'vitest'

import {
  buildOriginalEvidenceContextAppendix,
  formatOriginalEvidenceDocsForPrompt,
  formatSingleEvidenceLine,
  loadOriginalEvidencePromptSlice,
} from '@/services/evidence/formatOriginalEvidenceForPrompt'

describe('formatSingleEvidenceLine', () => {
  it('includes mediaId when media is numeric', () => {
    expect(formatSingleEvidenceLine({ kind: 'receipt', media: 42 })).toContain('mediaId=42')
  })

  it('truncates long notes', () => {
    const long = 'a'.repeat(320)
    const line = formatSingleEvidenceLine({ kind: 'screenshot', notes: long })
    expect(line).toContain('…')
    expect(line.length).toBeLessThan(long.length)
  })

  it('includes populated media fields', () => {
    const line = formatSingleEvidenceLine({
      kind: 'unboxing',
      media: {
        filename: 'box.jpg',
        url: 'https://cdn.example/box.jpg',
        alt: 'Alt text here',
      },
    })
    expect(line).toContain('file=box.jpg')
    expect(line).toContain('url=https://cdn.example/box.jpg')
    expect(line).toContain('alt=Alt text here')
  })
})

describe('formatOriginalEvidenceDocsForPrompt', () => {
  it('returns empty for empty docs', () => {
    expect(formatOriginalEvidenceDocsForPrompt([])).toBe('')
  })

  it('formats bullets for multiple docs', () => {
    const s = formatOriginalEvidenceDocsForPrompt([
      { kind: 'receipt', capturedAt: '2024-01-01', notes: 'paid' },
      { kind: 'screenshot', media: { filename: 'a.png', url: 'https://x/a.png' } },
    ])
    expect(s).toContain('- kind=receipt')
    expect(s).toContain('file=a.png')
  })

  it('respects maxItems', () => {
    const docs = [{ kind: 'a' }, { kind: 'b' }, { kind: 'c' }]
    const s = formatOriginalEvidenceDocsForPrompt(docs, { maxItems: 2 })
    expect(s).toContain('kind=a')
    expect(s).toContain('kind=b')
    expect(s).not.toContain('kind=c')
  })

  it('truncates total length to maxChars', () => {
    const docs = [{ kind: 'x', notes: 'y'.repeat(5000) }]
    const s = formatOriginalEvidenceDocsForPrompt(docs, { maxChars: 200 })
    expect(s.length).toBeLessThanOrEqual(200)
    expect(s.endsWith('…')).toBe(true)
  })
})

describe('buildOriginalEvidenceContextAppendix', () => {
  it('returns empty for whitespace-only slice', () => {
    expect(buildOriginalEvidenceContextAppendix('  \n')).toBe('')
  })

  it('wraps slice with header', () => {
    const a = buildOriginalEvidenceContextAppendix('- kind=a')
    expect(a).toContain('First-hand evidence')
    expect(a).toContain('kind=a')
  })
})

describe('loadOriginalEvidencePromptSlice', () => {
  it('returns empty on find failure', async () => {
    const payload = {
      find: vi.fn().mockRejectedValue(new Error('db')),
    }
    await expect(loadOriginalEvidencePromptSlice(payload as never, 1)).resolves.toBe('')
  })

  it('maps docs from payload.find', async () => {
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: [{ kind: 'benchmark', notes: 'cpu', media: { filename: 'f.jpg' } }],
      }),
    }
    const s = await loadOriginalEvidencePromptSlice(payload as never, 99)
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'original-evidence',
        where: { article: { equals: 99 } },
      }),
    )
    expect(s).toContain('benchmark')
    expect(s).toContain('cpu')
  })

  it('returns empty for non-finite articleId', async () => {
    const payload = { find: vi.fn() }
    await expect(loadOriginalEvidencePromptSlice(payload as never, Number.NaN)).resolves.toBe('')
    expect(payload.find).not.toHaveBeenCalled()
  })
})
