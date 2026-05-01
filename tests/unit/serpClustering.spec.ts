import { describe, expect, it } from 'vitest'

import {
  clusterByOverlap,
  extractOrganicTopNormalizedUrls,
  normalizeSerpUrl,
  pickPillarForCluster,
  type ClusterOverlapItem,
} from '@/utilities/serpClustering'

describe('normalizeSerpUrl', () => {
  it('strips www, query, trailing slash, lowercases host and path', () => {
    expect(normalizeSerpUrl('HTTPS://WWW.Example.com/Foo/bar/?x=1#h')).toBe('example.com/foo/bar')
  })
  it('returns null for non-http', () => {
    expect(normalizeSerpUrl('/relative')).toBeNull()
  })
})

describe('extractOrganicTopNormalizedUrls', () => {
  it('returns ranked organic urls up to limit', () => {
    const raw = {
      status_code: 20000,
      tasks: [
        {
          status_code: 20000,
          result: [
            {
              items: [
                { type: 'organic', rank_absolute: 2, url: 'https://b.com/x' },
                { type: 'organic', rank_absolute: 1, url: 'https://a.com/y' },
                { type: 'people_also_ask', url: 'https://ignore.com' },
              ],
            },
          ],
        },
      ],
    }
    const urls = extractOrganicTopNormalizedUrls(raw, 10)
    expect(urls[0]).toBe('a.com/y')
    expect(urls[1]).toBe('b.com/x')
  })
})

describe('clusterByOverlap', () => {
  it('closes A∩B≥3 and B∩C≥3 into one cluster despite A∩C=1', () => {
    const u = ['a.com/1', 'a.com/2', 'a.com/3', 'only-a', 'only-b', 'only-c']
    const A: ClusterOverlapItem = {
      id: 1,
      term: 'a',
      volume: 100,
      kd: 10,
      eligible: false,
      existingPillarId: null,
      urls: [u[0], u[1], u[2], u[3]].filter(Boolean) as string[],
    }
    const B: ClusterOverlapItem = {
      id: 2,
      term: 'b',
      volume: 200,
      kd: 10,
      eligible: false,
      existingPillarId: null,
      urls: [u[0], u[1], u[2], u[4]] as string[],
    }
    const C: ClusterOverlapItem = {
      id: 3,
      term: 'c',
      volume: 50,
      kd: 10,
      eligible: false,
      existingPillarId: null,
      urls: [u[4], u[0], u[1], u[5]] as string[],
    }
    const groups = clusterByOverlap([A, B, C], 3)
    expect(groups.length).toBe(1)
    expect(new Set(groups[0]?.map((g) => g.id))).toEqual(new Set([1, 2, 3]))
  })
})

describe('pickPillarForCluster', () => {
  it('prefers eligible then higher volume', () => {
    const members: ClusterOverlapItem[] = [
      {
        id: 1,
        term: 'a',
        volume: 1000,
        kd: 5,
        eligible: false,
        existingPillarId: null,
        urls: ['x'],
      },
      {
        id: 2,
        term: 'b',
        volume: 100,
        kd: 5,
        eligible: true,
        existingPillarId: null,
        urls: ['x'],
      },
    ]
    expect(pickPillarForCluster(members)).toBe(2)
  })

  it('breaks volume tie by lower kd', () => {
    const members: ClusterOverlapItem[] = [
      {
        id: 1,
        term: 'a',
        volume: 100,
        kd: 40,
        eligible: false,
        existingPillarId: null,
        urls: ['x'],
      },
      {
        id: 2,
        term: 'b',
        volume: 100,
        kd: 20,
        eligible: false,
        existingPillarId: null,
        urls: ['x'],
      },
    ]
    expect(pickPillarForCluster(members)).toBe(2)
  })

  it('respects historical in-cluster pillar votes', () => {
    const members: ClusterOverlapItem[] = [
      {
        id: 1,
        term: 'a',
        volume: 999,
        kd: 1,
        eligible: false,
        existingPillarId: 3,
        urls: ['x'],
      },
      {
        id: 2,
        term: 'b',
        volume: 50,
        kd: 50,
        eligible: false,
        existingPillarId: 3,
        urls: ['x'],
      },
      {
        id: 3,
        term: 'c',
        volume: 10,
        kd: 50,
        eligible: false,
        existingPillarId: null,
        urls: ['x'],
      },
    ]
    expect(pickPillarForCluster(members)).toBe(3)
  })
})
