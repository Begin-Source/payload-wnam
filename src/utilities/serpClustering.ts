/**
 * SERP overlap clustering for keywords (pillar / spoke).
 * Uses normalized organic top URLs from DataForSEO google/organic/live/advanced.
 */

import { unwrapSerpTaskItems } from '@/utilities/serpBriefExtract'

/** Normalize URL for overlap: host lowercase, strip www., drop query/hash, trim trailing slash. */
export function normalizeSerpUrl(rawUrl: string): string | null {
  const u = typeof rawUrl === 'string' ? rawUrl.trim() : ''
  if (!/^https?:\/\//i.test(u)) return null
  try {
    const parsed = new URL(u)
    let host = parsed.hostname.toLowerCase()
    if (host.startsWith('www.')) host = host.slice(4)
    let path = parsed.pathname || '/'
    if (path !== '/' && path.endsWith('/')) path = path.slice(0, -1)
    path = path.toLowerCase()
    return `${host}${path}`
  } catch {
    return null
  }
}

/**
 * Organic results from DFS envelope, sorted by rank, first `limit` URLs normalized.
 */
export function extractOrganicTopNormalizedUrls(raw: unknown, limit = 10): string[] {
  const items = unwrapSerpTaskItems(raw)
  if (!items?.length) return []

  type Row = {
    type?: string
    rank_absolute?: number
    rank_group?: number
    url?: string
  }
  const organic: { rank: number; norm: string | null }[] = []
  for (const it of items) {
    if (!it || typeof it !== 'object') continue
    const row = it as Row
    if ((row.type || '').toLowerCase() !== 'organic') continue
    const url = typeof row.url === 'string' ? row.url : ''
    const norm = normalizeSerpUrl(url)
    if (!norm) continue
    const rank =
      typeof row.rank_absolute === 'number' && Number.isFinite(row.rank_absolute)
        ? row.rank_absolute
        : typeof row.rank_group === 'number' && Number.isFinite(row.rank_group)
          ? row.rank_group
          : organic.length + 1
    organic.push({ rank, norm })
  }
  organic.sort((a, b) => a.rank - b.rank)
  const seen = new Set<string>()
  const out: string[] = []
  for (const { norm } of organic) {
    if (seen.has(norm)) continue
    seen.add(norm)
    out.push(norm)
    if (out.length >= limit) break
  }
  return out
}

export type ClusterOverlapItem = {
  id: number
  term: string
  volume: number | null
  kd: number | null
  eligible: boolean
  existingPillarId: number | null
  urls: string[]
}

class UnionFind {
  private readonly parent: Map<number, number> = new Map()

  constructor(ids: number[]) {
    for (const id of ids) this.parent.set(id, id)
  }

  find(x: number): number {
    const p = this.parent.get(x) ?? x
    if (p !== x) {
      const r = this.find(p)
      this.parent.set(x, r)
      return r
    }
    return x
  }

  union(a: number, b: number): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }
}

/** Build disjoint clusters where each pair shares >= minOverlap normalized URLs (union closure). */
export function clusterByOverlap(items: ClusterOverlapItem[], minOverlap: number): ClusterOverlapItem[][] {
  if (items.length === 0) return []
  const eff = Math.max(1, Math.floor(minOverlap))
  const ids = items.map((i) => i.id)
  const uf = new UnionFind(ids)
  const urlSets = items.map((i) => new Set(i.urls))

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      let inter = 0
      const si = urlSets[i]!
      const sj = urlSets[j]!
      for (const u of si) {
        if (sj.has(u)) inter++
        if (inter >= eff) break
      }
      if (inter >= eff) {
        uf.union(items[i]!.id, items[j]!.id)
      }
    }
  }

  const groups = new Map<number, ClusterOverlapItem[]>()
  for (const it of items) {
    const root = uf.find(it.id)
    const list = groups.get(root) ?? []
    list.push(it)
    groups.set(root, list)
  }
  return [...groups.values()]
}

function volumeSortKey(v: number | null): number {
  return v == null || !Number.isFinite(v) ? -1 : v
}

function kdSortKey(k: number | null): number {
  return k == null || !Number.isFinite(k) ? 999 : k
}

/**
 * Pick pillar id: historical in-cluster votes first, else eligible + volume desc + kd asc + term.
 */
export function pickPillarForCluster(members: ClusterOverlapItem[]): number {
  if (members.length === 1) return members[0]!.id
  const memberIds = new Set(members.map((m) => m.id))
  const votes = new Map<number, number>()
  for (const m of members) {
    const p = m.existingPillarId
    if (p != null && memberIds.has(p)) {
      votes.set(p, (votes.get(p) ?? 0) + 1)
    }
  }
  if (votes.size > 0) {
    const bestIds: number[] = []
    let bestVotes = -1
    for (const [pid, c] of votes) {
      if (c > bestVotes) {
        bestVotes = c
        bestIds.length = 0
        bestIds.push(pid)
      } else if (c === bestVotes) {
        bestIds.push(pid)
      }
    }
    if (bestIds.length === 1) {
      return bestIds[0]!
    }
    const candidates = bestIds
      .map((id) => members.find((m) => m.id === id))
      .filter((x): x is ClusterOverlapItem => x != null)
    candidates.sort(comparePillarCandidates)
    return candidates[0]!.id
  }

  const anyEligible = members.some((m) => m.eligible)
  const pool = anyEligible ? members.filter((m) => m.eligible) : members
  const sorted = [...pool].sort(comparePillarCandidates)
  return sorted[0]!.id
}

function comparePillarCandidates(a: ClusterOverlapItem, b: ClusterOverlapItem): number {
  const va = volumeSortKey(a.volume)
  const vb = volumeSortKey(b.volume)
  if (vb !== va) return vb - va
  const ka = kdSortKey(a.kd)
  const kb = kdSortKey(b.kd)
  if (ka !== kb) return ka - kb
  return a.term.localeCompare(b.term)
}

/** Min pairwise overlap across members (connected via edges >= minOverlap); for singleton return urls.length. */
export function clusterMinPairwiseOverlap(members: ClusterOverlapItem[], minOverlap: number): number {
  if (members.length <= 1) return Math.min(10, members[0]?.urls.length ?? 0)
  const eff = Math.max(1, Math.floor(minOverlap))
  const sets = members.map((m) => new Set(m.urls))
  let minV = Number.POSITIVE_INFINITY
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      let inter = 0
      for (const u of sets[i]!) {
        if (sets[j]!.has(u)) inter++
      }
      if (inter >= eff) minV = Math.min(minV, inter)
    }
  }
  return minV === Number.POSITIVE_INFINITY ? 0 : minV
}
