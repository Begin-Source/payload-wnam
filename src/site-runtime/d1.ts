import { requireSiteContext } from './context'

/** One adapter client per isolate; no database is captured during initialization. */
export function createSiteD1Proxy(): D1Database {
  type Owner = ReturnType<typeof requireSiteContext>
  const statements = new WeakMap<object, { owner: Owner; statement: D1PreparedStatement }>()

  function assertOwner(owner: Owner) {
    const current = requireSiteContext()
    if (current.requestToken !== owner.requestToken || current.binding !== owner.binding) {
      throw new Error('Cross-context D1 statement rejected')
    }
  }

  function wrap(statement: D1PreparedStatement, owner: Owner): D1PreparedStatement {
    const wrapped = new Proxy(statement, {
      get(target, key) {
        if (key === 'bind') return (...values: unknown[]) => {
          assertOwner(owner)
          return wrap(target.bind(...values), owner)
        }
        if (key === 'first' || key === 'all' || key === 'raw' || key === 'run') {
          return (...args: unknown[]) => {
            assertOwner(owner)
            return Reflect.apply(Reflect.get(target, key), target, args)
          }
        }
        // Do not expose internal binding/session fields on a wrapped statement.
        return undefined
      },
    })
    statements.set(wrapped, { owner, statement })
    return wrapped
  }

  return Object.freeze({
    prepare(sql: string) {
      const context = requireSiteContext()
      return wrap(context.binding.prepare(sql), context)
    },
    batch<T = unknown>(input: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      const context = requireSiteContext()
      const originals = input.map((item) => {
        const entry = statements.get(item)
        if (!entry) throw new Error('Unscoped D1 statement rejected')
        assertOwner(entry.owner)
        return entry.statement
      })
      return context.binding.batch<T>(originals)
    },
    exec(sql: string) {
      return requireSiteContext().binding.exec(sql)
    },
    dump() {
      return requireSiteContext().binding.dump()
    },
    withSession() {
      throw new Error('Site database read replicas/sessions are disabled')
    },
  }) as D1Database
}
