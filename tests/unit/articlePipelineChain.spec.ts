import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Payload } from 'payload'

vi.mock('@/utilities/resolvePipelineConfig', () => ({
  resolvePipelineConfigForArticle: vi.fn(),
}))

import { resolvePipelineConfigForArticle } from '@/utilities/resolvePipelineConfig'
import { normalizeGlobalPipelineDoc } from '@/utilities/pipelineSettingShape'

import {
  enqueueAvailableDraftSectionJobs,
  enqueueDraftFinalizeIfSectionsDone,
  enqueueImageGenerateIfNeeded,
  loadBriefSectionSpecs,
  mergeCanonicalBriefSectionRows,
  successfulDraftSectionIds,
} from '@/app/api/pipeline/lib/articlePipelineChain'

describe('articlePipelineChain', () => {
  it('mergeCanonicalBriefSectionRows fills body and conclusion when brief only has intro+faq', () => {
    const merged = mergeCanonicalBriefSectionRows([
      { id: 'intro', sectionType: 'intro' },
      { id: 'faq', sectionType: 'faq' },
    ])
    expect(merged.map((r) => r.id)).toEqual(['intro', 'body', 'faq', 'conclusion'])
    expect(merged.find((r) => r.id === 'body')?.sectionType).toBe('custom')
    expect(merged.find((r) => r.id === 'conclusion')?.sectionType).toBe('conclusion')
  })

  it('mergeCanonicalBriefSectionRows leaves cluster-style ids untouched', () => {
    const rows = [
      { id: 'kw-a', sectionType: 'custom' },
      { id: 'kw-b', sectionType: 'custom' },
    ]
    expect(mergeCanonicalBriefSectionRows(rows)).toEqual(rows)
  })

  it('loadBriefSectionSpecs expands canonical subset and persists outline', async () => {
    const update = vi.fn().mockResolvedValue({})
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        outline: {
          globalContext: { targetKeyword: 'x' },
          sections: [
            { id: 'intro', type: 'intro' },
            { id: 'faq', type: 'faq' },
          ],
        },
      }),
      update,
      logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
    } as unknown as Payload

    const specs = await loadBriefSectionSpecs(payload as Payload, 10)
    expect(specs.map((x) => x.id)).toEqual(['intro', 'body', 'faq', 'conclusion'])
    expect(specs[0]?.sectionType).toBe('intro')
    expect(specs[2]?.sectionType).toBe('faq')
    expect(update).toHaveBeenCalledTimes(1)
    const upd = update.mock.calls[0]?.[0] as {
      data?: { outline?: { sections?: Array<{ id: string; type: string }> } }
    }
    expect(upd.data?.outline?.sections?.map((s) => s.id)).toEqual(['intro', 'body', 'faq', 'conclusion'])
  })

  it('successfulDraftSectionIds collects sections from completed draft_section jobs with ok output', async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        sectionSummaries: {
          intro: { writtenAt: '2026-01-01T00:00:00.000Z', excerpt: 'Intro paragraph text.' },
        },
        body: {},
      }),
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

  it('successfulDraftSectionIds ignores writtenAt when excerpt is empty (no real merge)', async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        sectionSummaries: {
          intro: { writtenAt: '2026-01-01T00:00:00.000Z', excerpt: '' },
        },
        body: {},
      }),
      find: vi.fn().mockResolvedValue({
        docs: [
          {
            status: 'completed',
            output: { ok: true },
            input: { sectionId: 'intro' },
          },
        ],
      }),
    } as unknown as Payload

    const ids = await successfulDraftSectionIds(payload as Payload, 99)
    expect([...ids]).toEqual([])
  })

  it('successfulDraftSectionIds ignores completed jobs when skeleton placeholder still in body and no summary', async () => {
    const { buildLexicalSkeleton } = await import('@/services/writing/skeletonBuilder')
    const body = buildLexicalSkeleton(['intro', 'faq'])
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        sectionSummaries: { globalContext: 'ctx' },
        body,
      }),
      find: vi.fn().mockResolvedValue({
        docs: [
          {
            status: 'completed',
            output: { ok: true },
            input: { sectionId: 'intro' },
          },
        ],
      }),
    } as unknown as Payload

    const ids = await successfulDraftSectionIds(payload as Payload, 1)
    expect([...ids]).toEqual([])
  })

  it('successfulDraftSectionIds does not treat missing placeholder alone as merged (no false done)', async () => {
    const { buildLexicalSkeleton } = await import('@/services/writing/skeletonBuilder')
    const full = buildLexicalSkeleton(['intro', 'body', 'faq', 'conclusion'])
    const root = full.root as { children: Record<string, unknown>[] }
    const children = root.children.filter(
      (n) => !(n && typeof n === 'object' && n.dataSectionId === 'body'),
    )
    const body = { root: { ...root, children } }

    const payload = {
      findByID: vi.fn().mockResolvedValue({
        sectionSummaries: { globalContext: 'ctx' },
        body,
      }),
      find: vi.fn().mockResolvedValue({
        docs: [
          {
            status: 'completed',
            output: { ok: true },
            input: { sectionId: 'body' },
          },
        ],
      }),
    } as unknown as Payload

    const ids = await successfulDraftSectionIds(payload as Payload, 1)
    expect([...ids]).toEqual([])
  })

  it('successfulDraftSectionIds counts done when output.written is true even if summaries missing', async () => {
    const { buildLexicalSkeleton } = await import('@/services/writing/skeletonBuilder')
    const body = buildLexicalSkeleton(['intro'])
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        sectionSummaries: {},
        body,
      }),
      find: vi.fn().mockResolvedValue({
        docs: [
          {
            status: 'completed',
            output: { ok: true, written: true },
            input: { sectionId: 'intro' },
          },
        ],
      }),
    } as unknown as Payload

    const ids = await successfulDraftSectionIds(payload as Payload, 1)
    expect([...ids]).toEqual(['intro'])
  })

  describe('enqueueAvailableDraftSectionJobs', () => {
    beforeEach(() => {
      vi.mocked(resolvePipelineConfigForArticle).mockReset()
    })

    it('continues past a gated non-whitelist section so a later whitelisted section can enqueue', async () => {
      const base = normalizeGlobalPipelineDoc({})
      vi.mocked(resolvePipelineConfigForArticle).mockResolvedValue({
        merged: {
          ...base,
          sectionParallelism: 2,
          sectionParallelWhitelist: ['faq'],
        },
        profileId: 1,
        profileSlug: 'test-profile',
        source: 'global_only',
      })

      const create = vi.fn().mockResolvedValue({ id: 900 })
      const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }

      const payload = {
        logger,
        findByID: vi.fn((args: { collection: string }) => {
          if (args.collection === 'articles') {
            return Promise.resolve({
              id: 1,
              pipelineProfileSnapshot: { _: true },
              sectionSummaries: {
                intro: { writtenAt: '2026-01-01T00:00:00.000Z', excerpt: 'done' },
              },
              body: {},
            })
          }
          if (args.collection === 'content-briefs') {
            return Promise.resolve({
              outline: {
                sections: [
                  { id: 'intro', type: 'intro' },
                  { id: 'body', type: 'custom' },
                  { id: 'faq', type: 'faq' },
                ],
              },
            })
          }
          return Promise.resolve(null)
        }),
        find: vi
          .fn()
          .mockResolvedValueOnce({
            docs: [
              {
                status: 'completed',
                output: { ok: true },
                input: { sectionId: 'intro' },
              },
            ],
          })
          .mockResolvedValue({ docs: [] }),
        count: vi.fn().mockResolvedValue({ totalDocs: 1 }),
        create,
        update: vi.fn(),
      } as unknown as Payload

      const n = await enqueueAvailableDraftSectionJobs(payload, {
        articleNum: 1,
        briefNum: 2,
        siteId: null,
        tenantNum: null,
        globalContext: 'ctx',
        pipelineProfileId: 1,
      })

      expect(n).toBe(1)
      expect(create).toHaveBeenCalledTimes(1)
      const created = create.mock.calls[0]?.[0] as { data?: { input?: { sectionId?: string } } }
      expect(created?.data?.input?.sectionId).toBe('faq')
    })

    it('uses a narrow D1 update when storing a missing article pipeline snapshot', async () => {
      const base = normalizeGlobalPipelineDoc({})
      vi.mocked(resolvePipelineConfigForArticle).mockResolvedValue({
        merged: {
          ...base,
          sectionParallelism: 1,
          sectionParallelWhitelist: ['intro'],
        },
        profileId: 1,
        profileSlug: 'test-profile',
        source: 'profile',
      })

      const run = vi.fn().mockResolvedValue({})
      const bind = vi.fn().mockReturnValue({ run })
      const prepare = vi.fn().mockReturnValue({ bind })
      const update = vi.fn()
      const create = vi.fn().mockResolvedValue({ id: 901 })

      const payload = {
        db: { client: { prepare } },
        logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
        findByID: vi.fn((args: { collection: string }) => {
          if (args.collection === 'articles') {
            return Promise.resolve({
              id: 1,
              body: {},
              sectionSummaries: {},
            })
          }
          if (args.collection === 'content-briefs') {
            return Promise.resolve({
              outline: {
                sections: [{ id: 'intro', type: 'intro' }],
              },
            })
          }
          return Promise.resolve(null)
        }),
        find: vi.fn().mockResolvedValue({ docs: [] }),
        count: vi.fn().mockResolvedValue({ totalDocs: 0 }),
        create,
        update,
      } as unknown as Payload

      const n = await enqueueAvailableDraftSectionJobs(payload, {
        articleNum: 1,
        briefNum: 2,
        siteId: null,
        tenantNum: null,
        globalContext: 'ctx',
        pipelineProfileId: 1,
      })

      expect(n).toBe(1)
      expect(update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'articles',
        }),
      )
      expect(prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE `articles` SET'))
      expect(bind).toHaveBeenCalledWith(
        expect.stringContaining('"sectionParallelism":1'),
        'test-profile',
        'profile',
        expect.any(String),
        1,
      )
    })
  })

  describe('enqueueDraftFinalizeIfSectionsDone', () => {
    beforeEach(() => {
      vi.mocked(resolvePipelineConfigForArticle).mockReset()
    })

    it('does not create draft_finalize when article body has no extractable plain text', async () => {
      const base = normalizeGlobalPipelineDoc({})
      vi.mocked(resolvePipelineConfigForArticle).mockResolvedValue({
        merged: base,
        profileId: 1,
        profileSlug: 'p',
        source: 'global_only',
      })

      const create = vi.fn()
      const warn = vi.fn()
      const payload = {
        logger: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
        findByID: vi.fn((args: { collection: string }) => {
          if (args.collection === 'content-briefs') {
            return Promise.resolve({
              outline: { sections: [{ id: 'only', type: 'intro' }] },
            })
          }
          if (args.collection === 'articles') {
            return Promise.resolve({
              body: { root: { type: 'root', children: [] } },
              sectionSummaries: {
                only: { writtenAt: '2026-01-01T00:00:00.000Z', excerpt: 'has text' },
              },
            })
          }
          return Promise.resolve(null)
        }),
        find: vi.fn((args: { where?: unknown }) => {
          const flat = JSON.stringify(args.where)
          if (flat.includes('draft_section') && flat.includes('completed')) {
            return Promise.resolve({
              docs: [
                {
                  status: 'completed',
                  output: { ok: true },
                  input: { sectionId: 'only' },
                },
              ],
            })
          }
          if (flat.includes('draft_finalize') && flat.includes('completed')) {
            return Promise.resolve({ docs: [] })
          }
          return Promise.resolve({ docs: [] })
        }),
        count: vi.fn().mockResolvedValue({ totalDocs: 0 }),
        create,
        update: vi.fn(),
      } as unknown as Payload

      await enqueueDraftFinalizeIfSectionsDone(payload, {
        id: 99,
        jobType: 'draft_section',
        article: 42,
        contentBrief: 2,
        site: null,
        input: { articleId: 42, briefId: 2 },
      })

      expect(create).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalled()
    })

    it('creates draft_finalize when sections done and body has plain text', async () => {
      const base = normalizeGlobalPipelineDoc({})
      vi.mocked(resolvePipelineConfigForArticle).mockResolvedValue({
        merged: base,
        profileId: 1,
        profileSlug: 'p',
        source: 'global_only',
      })

      const { markdownToPageBodyLexical } = await import(
        '@/utilities/sitePagesBundleContent/markdownToPayloadLexical'
      )
      const body = markdownToPageBodyLexical('# Hello\n\nWorld.')

      const create = vi.fn().mockResolvedValue({ id: 1 })
      const payload = {
        logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
        findByID: vi.fn((args: { collection: string }) => {
          if (args.collection === 'content-briefs') {
            return Promise.resolve({
              outline: { sections: [{ id: 'only', type: 'intro' }] },
            })
          }
          if (args.collection === 'articles') {
            return Promise.resolve({
              body,
              sectionSummaries: {
                only: { writtenAt: '2026-01-01T00:00:00.000Z', excerpt: 'Hello' },
              },
            })
          }
          return Promise.resolve(null)
        }),
        find: vi.fn((args: { where?: unknown }) => {
          const flat = JSON.stringify(args.where)
          if (flat.includes('draft_section') && flat.includes('completed')) {
            return Promise.resolve({
              docs: [
                {
                  status: 'completed',
                  output: { ok: true },
                  input: { sectionId: 'only' },
                },
              ],
            })
          }
          if (flat.includes('draft_finalize') && flat.includes('completed')) {
            return Promise.resolve({ docs: [] })
          }
          return Promise.resolve({ docs: [] })
        }),
        count: vi.fn().mockResolvedValue({ totalDocs: 0 }),
        create,
        update: vi.fn(),
      } as unknown as Payload

      await enqueueDraftFinalizeIfSectionsDone(payload, {
        id: 99,
        jobType: 'draft_section',
        article: 42,
        contentBrief: 2,
        site: null,
        input: { articleId: 42, briefId: 2 },
      })

      expect(create).toHaveBeenCalledTimes(1)
      const row = create.mock.calls[0]?.[0] as { data?: { jobType?: string } }
      expect(row?.data?.jobType).toBe('draft_finalize')
    })
  })

  describe('enqueueImageGenerateIfNeeded', () => {
    beforeEach(() => {
      vi.mocked(resolvePipelineConfigForArticle).mockReset()
    })

    it('does not enqueue when merged pipeline has togetherImageEnabled false', async () => {
      const base = normalizeGlobalPipelineDoc({})
      vi.mocked(resolvePipelineConfigForArticle).mockResolvedValue({
        merged: { ...base, togetherImageEnabled: false },
        profileId: null,
        profileSlug: null,
        source: 'global_only',
      })

      const create = vi.fn()
      const payload = {
        findGlobal: vi.fn(),
        count: vi.fn(),
        create,
        findByID: vi.fn(),
      } as unknown as Payload

      await enqueueImageGenerateIfNeeded(payload, {
        id: 1,
        jobType: 'draft_finalize',
        article: 7,
        input: { articleId: 7, briefId: 1 },
      } as never)

      expect(create).not.toHaveBeenCalled()
      expect(payload.count).not.toHaveBeenCalled()
    })

    it('does not enqueue when resolve fails and global togetherImageEnabled is false', async () => {
      vi.mocked(resolvePipelineConfigForArticle).mockResolvedValue({ ok: false, error: 'x' })
      const g = normalizeGlobalPipelineDoc({ togetherImageEnabled: false })
      const create = vi.fn()
      const payload = {
        findGlobal: vi.fn().mockResolvedValue(g),
        count: vi.fn(),
        create,
        findByID: vi.fn(),
      } as unknown as Payload

      await enqueueImageGenerateIfNeeded(payload, {
        id: 1,
        jobType: 'draft_finalize',
        article: 7,
        input: { articleId: 7 },
      } as never)

      expect(create).not.toHaveBeenCalled()
    })
  })
})
