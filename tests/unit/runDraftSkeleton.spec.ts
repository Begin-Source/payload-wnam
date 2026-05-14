import { describe, expect, it, vi } from 'vitest'

import { runDraftSkeletonFromBrief } from '@/app/api/pipeline/draft-skeleton/runDraftSkeleton'
import { normalizeGlobalPipelineDoc } from '@/utilities/pipelineSettingShape'

describe('runDraftSkeletonFromBrief', () => {
  it('returns an existing article for the same brief instead of creating a duplicate', async () => {
    const create = vi.fn()
    const payload = {
      findByID: vi.fn(async (args: { collection: string }) => {
        if (args.collection === 'content-briefs') {
          return {
            id: 6,
            site: 3,
            tenant: 1,
            primaryKeyword: 10,
            outline: {
              sections: [{ id: 'intro' }, { id: 'body' }],
              globalContext: { targetKeyword: 'camp table' },
            },
            title: 'Brief: Coleman Camp Table',
          }
        }
        return null
      }),
      find: vi.fn(async (args: { collection: string }) => {
        if (args.collection === 'articles') return { docs: [{ id: '31' }], totalDocs: 1 }
        return { docs: [], totalDocs: 0 }
      }),
      create,
      logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }

    const result = await runDraftSkeletonFromBrief(payload as never, {
      briefId: 6,
      siteIdOverride: 3,
      merged: normalizeGlobalPipelineDoc({}),
    })

    expect(result).toEqual({ ok: true, articleId: 31 })
    expect(create).not.toHaveBeenCalled()
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'articles',
        where: {
          and: [{ sourceBrief: { equals: 6 } }, { site: { equals: 3 } }],
        },
      }),
    )
  })
})
