import { describe, expect, it, vi } from 'vitest'

import type { Payload } from 'payload'

import { runDraftFinalizeForArticle } from '@/app/api/pipeline/draft-finalize/runDraftFinalize'

vi.mock('@/utilities/resolvePipelineConfig', () => ({
  resolvePipelineConfigForArticle: vi.fn().mockResolvedValue({
    merged: {
      frugalMode: false,
      tavilyEnabled: false,
      sectionVariant: 'sequential',
      finalizeVariant: 'simple_merge',
      briefDepth: 'standard',
      sectionParallelism: 1,
    },
    profileId: null,
    profileSlug: null,
    source: 'global_only',
  }),
}))

describe('runDraftFinalizeForArticle', () => {
  it('returns 422 when Lexical body has no extractable plain text', async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        id: 42,
        title: 'T',
        body: { root: { type: 'root', children: [{ type: 'horizontalrule', version: 1 }] } },
        tenant: null,
        site: null,
      }),
      findGlobal: vi.fn().mockResolvedValue({}),
      logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
    } as unknown as Payload

    const r = await runDraftFinalizeForArticle(payload, 42)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(422)
      expect(r.error).toMatch(/extractable text/i)
    }
  })
})
