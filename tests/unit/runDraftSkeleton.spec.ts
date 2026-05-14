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

  it('uses narrow D1 insert for new skeleton articles when a D1 client is available', async () => {
    const create = vi.fn()
    const preparedSql: string[] = []
    const client = {
      prepare: vi.fn((sql: string) => {
        preparedSql.push(sql)
        return {
          bind: vi.fn(() => ({
            first: vi.fn(async () => {
              if (sql.includes('SELECT `id` FROM `articles`')) return null
              if (sql.includes('INSERT INTO `articles`')) return { id: 41 }
              return null
            }),
            run: vi.fn(async () => ({})),
          })),
        }
      }),
    }
    const payload = {
      db: { client },
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
        if (args.collection === 'keywords') return { term: 'coleman camp table', slug: 'coleman-camp-table' }
        if (args.collection === 'sites') return { tenant: 1, pipelineProfile: 9 }
        return null
      }),
      find: vi.fn(async (args: { collection: string }) => {
        if (args.collection === 'articles') return { docs: [], totalDocs: 0 }
        return { docs: [], totalDocs: 0 }
      }),
      create,
      update: vi.fn(),
      logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }

    const result = await runDraftSkeletonFromBrief(payload as never, {
      briefId: 6,
      siteIdOverride: 3,
      merged: normalizeGlobalPipelineDoc({}),
    })

    expect(result).toEqual({ ok: true, articleId: 41 })
    expect(create).not.toHaveBeenCalled()
    expect(preparedSql.some((sql) => sql.includes('INSERT INTO `articles`'))).toBe(true)
  })
})
