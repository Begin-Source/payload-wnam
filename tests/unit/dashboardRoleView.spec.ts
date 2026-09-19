import { describe, expect, it } from 'vitest'

import { dashboardRoleView, dashboardWorkbenchMode } from '@/utilities/dashboardRoleView'

const user = (roles: string[]) =>
  ({ collection: 'users', id: 7, email: 'role@example.invalid', roles }) as never

describe('dashboard role projection', () => {
  it('gives platform and business managers the correct views', () => {
    expect(dashboardRoleView(user(['super-admin']))).toBe('executive')
    expect(dashboardRoleView(user(['general-manager']))).toBe('operations')
    expect(dashboardRoleView(user(['ops-manager']))).toBe('operations')
    expect(dashboardRoleView(user(['team-lead']))).toBe('operations')
    expect(dashboardRoleView(user(['site-manager']))).toBe('operations')
  })

  it('keeps finance and system projections separate from operations', () => {
    expect(dashboardRoleView(user(['finance']))).toBe('finance')
    expect(dashboardRoleView(user(['system-admin']))).toBe('system')
    expect(dashboardRoleView(user(['finance', 'ops-manager']))).toBe('operations')
  })

  it('separates manager decisions from site-manager daily work', () => {
    expect(dashboardWorkbenchMode(user(['general-manager']))).toBe('management')
    expect(dashboardWorkbenchMode(user(['ops-manager']))).toBe('management')
    expect(dashboardWorkbenchMode(user(['team-lead']))).toBe('management')
    expect(dashboardWorkbenchMode(user(['site-manager']))).toBe('personal')
    expect(dashboardWorkbenchMode(user(['finance']))).toBe('finance')
    expect(dashboardWorkbenchMode(user(['system-admin']))).toBe('system')
  })

  it('does not expose an internal workbench to plain or missing users', () => {
    expect(dashboardRoleView(user(['user']))).toBe('public')
    expect(dashboardRoleView(null)).toBe('public')
  })
})
