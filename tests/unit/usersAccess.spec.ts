import { describe, expect, it } from 'vitest'

import { usersReadWhere, usersUpdateWhere } from '@/utilities/usersAccess'

type MockUser = {
  id: number
  email: string
  collection: 'users'
  roles?: string[] | null
  tenants?: { tenant: number | { id: number } }[] | null
}

function u(partial: MockUser): MockUser {
  return { ...partial }
}

describe('usersReadWhere (用户列表：全站 vs 租户内)', () => {
  it('system-admin 与 super-admin 返回 true，不附加租户 where（可看全站用户）', () => {
    const systemAdmin = u({
      id: 1,
      email: 'sys@x.test',
      collection: 'users',
      roles: ['system-admin'],
    })
    expect(usersReadWhere(systemAdmin)).toBe(true)

    const superAdmin = u({
      id: 2,
      email: 'root@x.test',
      collection: 'users',
      roles: ['super-admin'],
    })
    expect(usersReadWhere(superAdmin)).toBe(true)
  })

  it('非全站无租户能力且已分配租户：或分支为本人 或 同租户且 roles 非 super/system-admin', () => {
    const tenantId = 42
    const viewer = u({
      id: 7,
      email: 'ops@x.test',
      collection: 'users',
      roles: ['ops-manager'],
      tenants: [{ tenant: { id: tenantId } }],
    })
    const where = usersReadWhere(viewer)
    expect(typeof where).toBe('object')
    if (where === true) throw new Error('expected Where')
    expect('or' in where).toBe(true)
    const or = (where as { or: unknown[] }).or
    expect(or[0]).toEqual({ id: { equals: 7 } })
    const tenantBranch = or[1] as {
      and: [{ or: unknown[] }, { roles: { not_in: string[] } }]
    }
    expect('and' in tenantBranch).toBe(true)
    expect(tenantBranch.and[0]).toEqual({
      or: [{ 'tenants.tenant': { equals: tenantId } }],
    })
    expect(tenantBranch.and[1]).toEqual({
      roles: { not_in: ['super-admin', 'system-admin'] },
    })
    expect(or).toHaveLength(2)
  })

  it('多租户时同租户分句为 or(tenant1, tenant2) 再与 not_in(roles) 与', () => {
    const viewer = u({
      id: 9,
      email: 'gm@x.test',
      collection: 'users',
      roles: ['general-manager'],
      tenants: [{ tenant: { id: 1 } }, { tenant: { id: 2 } }],
    })
    const where = usersReadWhere(viewer) as {
      or: [unknown, { and: [{ or: unknown[] }, { roles: unknown }] }]
    }
    expect(where.or[0]).toEqual({ id: { equals: 9 } })
    const and = (where.or[1] as { and: unknown[] }).and
    expect((and[0] as { or: unknown[] }).or).toEqual(
      expect.arrayContaining([
        { 'tenants.tenant': { equals: 1 } },
        { 'tenants.tenant': { equals: 2 } },
      ]),
    )
    expect((and[0] as { or: unknown[] }).or).toHaveLength(2)
    expect(and[1]).toEqual({ roles: { not_in: ['super-admin', 'system-admin'] } })
  })

  it('无 tenants 且非全站无租户能力：仅可见本人', () => {
    const viewer = u({
      id: 3,
      email: 'a@x.test',
      collection: 'users',
      roles: ['user'],
      tenants: [],
    })
    expect(usersReadWhere(viewer)).toEqual({ id: { equals: 3 } })
  })

  it('非 users 集合 session 为 false', () => {
    expect(
      usersReadWhere({ id: 1, email: 'k@k.test', collection: 'payload-mcp-api-keys' } as never),
    ).toBe(false)
  })
})

describe('usersUpdateWhere', () => {
  it('与 usersReadWhere 对同一 user 结果一致', () => {
    const user = u({
      id: 1,
      email: 'a@a.test',
      collection: 'users',
      roles: ['team-lead'],
      tenants: [{ tenant: 99 }],
    })
    expect(usersUpdateWhere(user)).toEqual(usersReadWhere(user))
  })
})
