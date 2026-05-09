import { describe, expect, it, vi } from 'vitest'

import { isSqliteLockError, runWithSqliteBusyRetry } from '@/utilities/sqliteBusyRetry'

describe('isSqliteLockError', () => {
  it('detects SQLITE_BUSY and database is locked', () => {
    expect(isSqliteLockError(new Error('SQLite failed: database is locked: SQLITE_BUSY'))).toBe(true)
    expect(isSqliteLockError(new Error('workerd/util/sqlite: database is locked'))).toBe(true)
    expect(isSqliteLockError(new Error('other'))).toBe(false)
  })
})

describe('runWithSqliteBusyRetry', () => {
  it('succeeds on first call', async () => {
    const fn = vi.fn().mockResolvedValue(42)
    const r = await runWithSqliteBusyRetry(fn, { maxAttempts: 3 })
    expect(r).toBe(42)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on lock then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('database is locked: SQLITE_BUSY'))
      .mockResolvedValueOnce('ok')

    const warn = vi.fn()
    const r = await runWithSqliteBusyRetry(fn, { logger: { warn }, maxAttempts: 3 })
    expect(r).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('throws after max attempts on persistent lock', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('SQLITE_BUSY'))
    await expect(runWithSqliteBusyRetry(fn, { maxAttempts: 2 })).rejects.toThrow('SQLITE_BUSY')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
