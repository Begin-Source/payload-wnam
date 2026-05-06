import { describe, expect, it } from 'vitest'

import {
  buildTeamSitesWhere,
  rosterFromTeamDoc,
  TEAM_STATS_MATCH_NOTHING,
} from '@/utilities/teamStatsScope'

describe('rosterFromTeamDoc', () => {
  it('dedupes lead appearing in members', () => {
    const r = rosterFromTeamDoc({
      lead: 10,
      members: [10, 20, { id: 20 }],
    })
    expect(r.leadId).toBe(10)
    expect(r.memberIds).toEqual([10, 20, 20])
    expect(r.creatorIds.sort((a, b) => a - b)).toEqual([10, 20])
  })

  it('reads tenant id from object form', () => {
    const r = rosterFromTeamDoc({
      tenant: { id: 5 },
      lead: 1,
      members: [],
    })
    expect(r.tenantId).toBe(5)
  })
})

describe('buildTeamSitesWhere', () => {
  it('returns no_lead when lead missing', () => {
    const roster = rosterFromTeamDoc({ members: [1, 2] })
    const b = buildTeamSitesWhere(roster)
    expect(b.ok).toBe(false)
    if (!b.ok) {
      expect(b.where).toEqual(TEAM_STATS_MATCH_NOTHING)
    }
  })

  it('builds or of createdBy-in and operators-contains-lead', () => {
    const roster = rosterFromTeamDoc({ lead: 100, members: [200] })
    const b = buildTeamSitesWhere(roster)
    expect(b.ok).toBe(true)
    if (b.ok) {
      expect(b.where).toEqual({
        or: [{ createdBy: { in: [100, 200] } }, { operators: { contains: 100 } }],
      })
    }
  })

  it('wraps with tenant equals when tenant present', () => {
    const roster = rosterFromTeamDoc({
      tenant: 7,
      lead: 1,
      members: [],
    })
    const b = buildTeamSitesWhere(roster)
    expect(b.ok).toBe(true)
    if (b.ok) {
      expect(b.where).toEqual({
        and: [{ tenant: { equals: 7 } }, { or: [{ createdBy: { in: [1] } }, { operators: { contains: 1 } }] }],
      })
    }
  })
})
