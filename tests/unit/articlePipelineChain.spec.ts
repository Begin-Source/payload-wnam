import { describe, expect, it, vi } from 'vitest'

import type { Payload } from 'payload'

import {
  loadBriefSectionSpecs,
  successfulDraftSectionIds,
} from '@/app/api/pipeline/lib/articlePipelineChain'

describe('articlePipelineChain', () => {
  it('loadBriefSectionSpecs reads outline sections from brief doc', async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        outline: {
          sections: [
            { id: 'intro', type: 'intro' },
            { id: 'faq', type: 'faq' },
          ],
        },
      }),
    } as unknown as Payload

    const specs = await loadBriefSectionSpecs(payload as Payload, 10)
    expect(specs.map((x) => x.id)).toEqual(['intro', 'faq'])
    expect(specs[0]?.sectionType).toBe('intro')
    expect(specs[1]?.sectionType).toBe('faq')
  })

  it('successfulDraftSectionIds collects sections from completed draft_section jobs with ok output', async () => {
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: [
          {
            status: 'completed',
            output: { ok: true },
            input: { sectionId: 'intro' },
          },
          {
            status: 'completed',
            output: { ok: false },
            input: { sectionId: 'body' },
          },
        ],
      }),
    } as unknown as Payload

    const ids = await successfulDraftSectionIds(payload as Payload, 99)
    expect([...ids]).toEqual(['intro'])
  })
})
