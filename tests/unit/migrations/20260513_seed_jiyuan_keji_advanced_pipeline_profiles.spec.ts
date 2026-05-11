import { describe, expect, it, vi } from 'vitest'

import { up } from '@/migrations/20260513_120000_seed_jiyuan_keji_advanced_pipeline_profiles'
import {
  SEO_PIPELINE_AUTHORITY_FIRST_SLUG,
  SEO_PIPELINE_SCALE_FRESH_SLUG,
} from '@/utilities/seoTheoryPipelineProfilePresets'

type MockDb = { get: ReturnType<typeof vi.fn> }
type MockPayload = {
  logger: { warn: ReturnType<typeof vi.fn> }
  find: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
}

function makeArgs(db: MockDb, payload: MockPayload) {
  return { db, payload, req: {} } as Parameters<typeof up>[0]
}

describe('migration 20260513_120000_seed_jiyuan_keji_advanced_pipeline_profiles', () => {
  it('creates both pipeline-profiles when tenant 基源科技 exists and slugs are absent', async () => {
    const created: Record<string, unknown>[] = []
    const db: MockDb = {
      get: vi.fn(async () => ({ c: 1 })),
    }
    const payload: MockPayload = {
      logger: { warn: vi.fn() },
      find: vi.fn(async (args: { collection: string }) => {
        if (args.collection === 'tenants') {
          return { docs: [{ id: 42, name: '基源科技' }] }
        }
        if (args.collection === 'pipeline-profiles') {
          return { docs: [] }
        }
        return { docs: [] }
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data)
        return { id: created.length }
      }),
    }

    await up(makeArgs(db, payload))

    expect(db.get).toHaveBeenCalled()
    expect(payload.create).toHaveBeenCalledTimes(2)
    expect(created[0]).toMatchObject({ tenant: 42, slug: SEO_PIPELINE_AUTHORITY_FIRST_SLUG })
    expect(created[1]).toMatchObject({ tenant: 42, slug: SEO_PIPELINE_SCALE_FRESH_SLUG })
    expect(payload.logger.warn).not.toHaveBeenCalled()
  })

  it('skips payload.create when each slug already exists', async () => {
    const db: MockDb = {
      get: vi.fn(async () => ({ c: 1 })),
    }
    const payload: MockPayload = {
      logger: { warn: vi.fn() },
      find: vi.fn(async (args: { collection: string }) => {
        if (args.collection === 'tenants') {
          return { docs: [{ id: 7, name: '基源科技' }] }
        }
        if (args.collection === 'pipeline-profiles') {
          return { docs: [{ id: 1 }] }
        }
        return { docs: [] }
      }),
      create: vi.fn(),
    }

    await up(makeArgs(db, payload))

    expect(payload.create).not.toHaveBeenCalled()
  })

  it('returns early when pipeline_profiles table is missing', async () => {
    const db: MockDb = {
      get: vi.fn(async () => ({ c: 0 })),
    }
    const payload: MockPayload = {
      logger: { warn: vi.fn() },
      find: vi.fn(),
      create: vi.fn(),
    }

    await up(makeArgs(db, payload))

    expect(payload.find).not.toHaveBeenCalled()
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('warns and does not create when no tenant named 基源科技', async () => {
    const db: MockDb = {
      get: vi.fn(async () => ({ c: 1 })),
    }
    const payload: MockPayload = {
      logger: { warn: vi.fn() },
      find: vi.fn(async (args: { collection: string }) => {
        if (args.collection === 'tenants') return { docs: [] }
        return { docs: [] }
      }),
      create: vi.fn(),
    }

    await up(makeArgs(db, payload))

    expect(payload.logger.warn).toHaveBeenCalled()
    expect(payload.create).not.toHaveBeenCalled()
  })
})
