import configPromise from '@payload-config'
import type { Config } from '@/payload-types'
import type { Payload, Where } from 'payload'
import { getPayload } from 'payload'

import { isUsersCollection } from '@/utilities/announcementAccess'
import {
  pipelineProfileAdminAuth,
  profileTenantNumeric,
  tenantIdsForPipelineProfileList,
} from '@/utilities/pipelineProfileAdminAccess'
import { tenantIdFromRelation } from '@/utilities/tenantScope'
import { userIsAnnouncementsPortalOnly } from '@/utilities/userAccessTiers'

export const dynamic = 'force-dynamic'

function relId(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'object' && v !== null && 'id' in v) {
    const id = (v as { id: unknown }).id
    if (typeof id === 'number' && Number.isFinite(id)) return id
  }
  return null
}

function effectiveTenantId(args: {
  scopeTenants: ReturnType<typeof tenantIdsForPipelineProfileList>
  tenantIdParam: number
}): number | null {
  const { scopeTenants, tenantIdParam } = args
  if (scopeTenants === 'none') return null
  if (scopeTenants === 'all') {
    return Number.isFinite(tenantIdParam) ? tenantIdParam : null
  }
  if (Number.isFinite(tenantIdParam)) {
    return scopeTenants.includes(tenantIdParam) ? tenantIdParam : null
  }
  if (scopeTenants.length === 1) return scopeTenants[0]
  return null
}

async function findAllPages<T extends { id?: unknown }>(
  payload: Payload,
  opts: {
    collection: 'sites' | 'click-events' | 'commissions'
    where: Where
    sort?: string
    depth?: number
    user: Config['user'] & { collection: 'users' }
    pageSize?: number
  },
): Promise<T[]> {
  const pageSize = opts.pageSize ?? 300
  const out: T[] = []
  let page = 1
  for (;;) {
    const res = await payload.find({
      collection: opts.collection,
      where: opts.where,
      sort: opts.sort,
      depth: opts.depth ?? 0,
      user: opts.user,
      overrideAccess: false,
      limit: pageSize,
      page,
    })
    out.push(...(res.docs as T[]))
    if (res.docs.length < pageSize) break
    page += 1
    if (page > 200) break
  }
  return out
}

/**
 * GET ?tenantId=&days=
 * Adoption + click + commission rollups for one tenant:
 * `strategyPairs` by (pipeline profile × keyword batch preset) per site, plus legacy
 * `pipelineProfiles` / `keywordPresets` single-dimension rollups.
 */
export async function GET(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const auth = pipelineProfileAdminAuth(user)
  if (!auth.ok) return auth.response

  const scopeTenants = tenantIdsForPipelineProfileList(auth.user)
  const url = new URL(request.url)
  const tenantIdRaw = url.searchParams.get('tenantId')
  const tenantIdParam =
    tenantIdRaw != null && tenantIdRaw !== '' ? Number(tenantIdRaw) : Number.NaN

  const daysRaw = url.searchParams.get('days')
  const daysParsed = daysRaw != null && daysRaw !== '' ? Number(daysRaw) : 30
  const days = Number.isFinite(daysParsed) ? Math.min(730, Math.max(1, Math.floor(daysParsed))) : 30

  if (scopeTenants === 'none') {
    return Response.json({ error: 'No tenant assignments' }, { status: 403 })
  }

  const effective = effectiveTenantId({ scopeTenants, tenantIdParam })
  if (effective == null) {
    if (scopeTenants === 'all') {
      return Response.json(
        { error: 'tenantId query required (number) when using all-tenant admin scope' },
        { status: 400 },
      )
    }
    return Response.json({ error: 'tenantId query required (number) when your account spans multiple tenants' }, {
      status: 400,
    })
  }

  if (scopeTenants !== 'all' && !scopeTenants.includes(effective)) {
    return Response.json({ error: 'tenantId not in your scope' }, { status: 403 })
  }

  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceIso = since.toISOString()

  const tenantWhere: Where = { tenant: { equals: effective } }

  const sites = await findAllPages<Record<string, unknown>>(payload, {
    collection: 'sites',
    where: tenantWhere,
    sort: 'name',
    depth: 0,
    user: auth.user,
  })

  const siteToProfile = new Map<number, number | null>()
  const siteToPreset = new Map<number, number | null>()
  const siteIds: number[] = []

  for (const s of sites) {
    const sid = typeof s.id === 'number' ? s.id : Number(s.id)
    if (!Number.isFinite(sid)) continue
    siteIds.push(sid)
    siteToProfile.set(sid, relId(s.pipelineProfile))
    siteToPreset.set(sid, relId(s.keywordBatchPreset))
  }

  const profileToSites = new Map<number, number[]>()
  const presetToSites = new Map<number, number[]>()
  const pairToSites = new Map<string, number[]>()
  let unassignedPipeline = 0

  for (const sid of siteIds) {
    const pid = siteToProfile.get(sid) ?? null
    const kid = siteToPreset.get(sid) ?? null
    const pairKey = `${pid ?? 'none'}:${kid ?? 'none'}`
    const pArr = pairToSites.get(pairKey) ?? []
    pArr.push(sid)
    pairToSites.set(pairKey, pArr)

    if (pid == null) {
      unassignedPipeline += 1
    } else {
      const arr = profileToSites.get(pid) ?? []
      arr.push(sid)
      profileToSites.set(pid, arr)
    }
    if (kid != null) {
      const arr = presetToSites.get(kid) ?? []
      arr.push(sid)
      presetToSites.set(kid, arr)
    }
  }

  const profileDocs = await payload.find({
    collection: 'pipeline-profiles',
    where: tenantWhere,
    limit: 300,
    depth: 0,
    user: auth.user,
    overrideAccess: false,
    sort: 'name',
  })

  const keywordPresetDocs = await payload.find({
    collection: 'keyword-batch-presets',
    where: tenantWhere,
    limit: 300,
    depth: 0,
    user: auth.user,
    overrideAccess: false,
    sort: 'name',
  })

  const clicksBySite = new Map<number, number>()
  if (siteIds.length > 0) {
    const clickWhere: Where = {
      and: [
        { tenant: { equals: effective } },
        { occurredAt: { greater_than_equal: sinceIso } },
        { eventType: { equals: 'click' as const } },
        { site: { in: siteIds } },
      ],
    }
    const clickEvents = await findAllPages<{ site?: unknown }>(payload, {
      collection: 'click-events',
      where: clickWhere,
      depth: 0,
      user: auth.user,
      pageSize: 500,
    })
    for (const ev of clickEvents) {
      const sid = relId(ev.site)
      if (sid == null) continue
      clicksBySite.set(sid, (clicksBySite.get(sid) ?? 0) + 1)
    }
  }

  const commissionBySite = new Map<number, number>()
  let commissionsIncluded = true
  let commissionsOmittedReason: string | null = null

  if (userIsAnnouncementsPortalOnly(user)) {
    commissionsIncluded = false
    commissionsOmittedReason = 'forbidden'
  } else if (siteIds.length > 0) {
    const commissionWhere: Where = {
      and: [
        { createdAt: { greater_than_equal: sinceIso } },
        { site: { in: siteIds } },
      ],
    }
    try {
      const commissionRows = await findAllPages<{
        site?: unknown
        amount?: unknown
      }>(payload, {
        collection: 'commissions',
        where: commissionWhere,
        depth: 0,
        user: auth.user,
        pageSize: 300,
      })
      for (const row of commissionRows) {
        const sid = relId(row.site)
        if (sid == null) continue
        const amt = typeof row.amount === 'number' && Number.isFinite(row.amount) ? row.amount : 0
        commissionBySite.set(sid, (commissionBySite.get(sid) ?? 0) + amt)
      }
    } catch {
      commissionsIncluded = false
      commissionsOmittedReason = 'forbidden'
    }
  }

  function sumForSites(sids: number[], bySite: Map<number, number>): number {
    let t = 0
    for (const sid of sids) t += bySite.get(sid) ?? 0
    return t
  }

  const pipelineProfiles = profileDocs.docs.map((doc) => {
    const id = doc.id as number
    const sids = profileToSites.get(id) ?? []
    return {
      id,
      name: typeof doc.name === 'string' ? doc.name : String(id),
      slug: typeof doc.slug === 'string' ? doc.slug : '',
      tenantId: profileTenantNumeric(doc.tenant),
      siteCount: sids.length,
      clickCount: sumForSites(sids, clicksBySite),
      commissionSum: commissionsIncluded ? sumForSites(sids, commissionBySite) : null,
    }
  })

  const keywordPresets = keywordPresetDocs.docs.map((doc) => {
    const id = doc.id as number
    const sids = presetToSites.get(id) ?? []
    return {
      id,
      name: typeof doc.name === 'string' ? doc.name : String(id),
      slug: typeof doc.slug === 'string' ? doc.slug : '',
      tenantId: tenantIdFromRelation(doc.tenant as never),
      siteCount: sids.length,
    }
  })

  const NULL_PROFILE_LABEL = '未绑定流水线方案'
  const NULL_PRESET_LABEL = '未绑定关键词排产预设'

  const profileInfo = new Map<number, { name: string; slug: string }>()
  for (const doc of profileDocs.docs) {
    const id = doc.id as number
    profileInfo.set(id, {
      name: typeof doc.name === 'string' ? doc.name : String(id),
      slug: typeof doc.slug === 'string' ? doc.slug : '',
    })
  }
  const presetInfo = new Map<number, { name: string; slug: string }>()
  for (const doc of keywordPresetDocs.docs) {
    const id = doc.id as number
    presetInfo.set(id, {
      name: typeof doc.name === 'string' ? doc.name : String(id),
      slug: typeof doc.slug === 'string' ? doc.slug : '',
    })
  }

  function parsePairKey(key: string): { pid: number | null; kid: number | null } {
    const idx = key.indexOf(':')
    const a = idx >= 0 ? key.slice(0, idx) : key
    const b = idx >= 0 ? key.slice(idx + 1) : 'none'
    return {
      pid: a === 'none' ? null : Number(a),
      kid: b === 'none' ? null : Number(b),
    }
  }

  const strategyPairs = [...pairToSites.entries()]
    .map(([pairKey, sids]) => {
      const { pid, kid } = parsePairKey(pairKey)
      const pName =
        pid == null ? NULL_PROFILE_LABEL : (profileInfo.get(pid)?.name ?? `流水线 #${pid}`)
      const pSlug = pid == null ? '' : (profileInfo.get(pid)?.slug ?? '')
      const kName =
        kid == null ? NULL_PRESET_LABEL : (presetInfo.get(kid)?.name ?? `预设 #${kid}`)
      const kSlug = kid == null ? '' : (presetInfo.get(kid)?.slug ?? '')
      const label = `${kName} + ${pName}`
      return {
        pipelineProfileId: pid,
        keywordBatchPresetId: kid,
        pipelineProfileName: pName,
        pipelineProfileSlug: pSlug,
        keywordPresetName: kName,
        keywordPresetSlug: kSlug,
        label,
        siteCount: sids.length,
        clickCount: sumForSites(sids, clicksBySite),
        commissionSum: commissionsIncluded ? sumForSites(sids, commissionBySite) : null,
      }
    })
    .sort(
      (a, b) =>
        b.siteCount - a.siteCount ||
        a.label.localeCompare(b.label, 'zh', { sensitivity: 'base' }),
    )

  return Response.json({
    tenantId: effective,
    days,
    since: sinceIso,
    strategyPairs,
    pipelineProfiles,
    keywordPresets,
    unassignedPipeline: { siteCount: unassignedPipeline },
    meta: {
      commissionsIncluded,
      ...(commissionsOmittedReason ? { commissionsOmittedReason } : {}),
      siteTotal: siteIds.length,
    },
  })
}
