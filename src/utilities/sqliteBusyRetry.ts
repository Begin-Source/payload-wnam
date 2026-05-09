/** Matches D1 / libsql / workerd SQLite lock errors seen in dev (e.g. SQLITE_BUSY). */
export function isSqliteLockError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /database is locked|SQLITE_BUSY|sqlite.*locked/i.test(msg)
}

type LoggerLike = { warn: (obj: object, msg?: string) => void }

export async function runWithSqliteBusyRetry<T>(
  fn: () => Promise<T>,
  opts: {
    logger?: LoggerLike
    label?: string
    /** Total attempts including the first try (default 4). */
    maxAttempts?: number
  } = {},
): Promise<T> {
  const maxAttempts = Math.max(1, Math.floor(opts.maxAttempts ?? 4))
  const delaysMs = [50, 150, 350, 700]
  let lastErr: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      const lock = isSqliteLockError(e)
      if (!lock || attempt === maxAttempts - 1) {
        throw e
      }
      opts.logger?.warn(
        {
          attempt: attempt + 1,
          maxAttempts,
          label: opts.label,
          err: e instanceof Error ? e.message : String(e),
        },
        '[sqliteBusyRetry] database locked, retrying',
      )
      await new Promise((r) => setTimeout(r, delaysMs[attempt] ?? 700))
    }
  }

  throw lastErr
}
