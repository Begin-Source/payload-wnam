import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { PipelineProfile } from '@/payload-types'
import { buildPipelineProfileReport } from '@/utilities/pipelineProfileReport'
import {
  pipelineProfileAdminAuth,
  profileTenantNumeric,
  userMayAccessPipelineProfileTenant,
} from '@/utilities/pipelineProfileAdminAccess'

export const dynamic = 'force-dynamic'

function parseDays(n: unknown, fallback: number): number {
  if (typeof n === 'number' && Number.isFinite(n)) {
    return Math.min(730, Math.max(1, Math.floor(n)))
  }
  if (typeof n === 'string' && /^\d+$/.test(n)) {
    return parseDays(Number(n), fallback)
  }
  return fallback
}

/** POST body: `{ profileIds: number[], days?: number }` — horizontal compare table data */
export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })

  const auth = pipelineProfileAdminAuth(user)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as {
    profileIds?: unknown
    days?: unknown
  }
  const rawIds = Array.isArray(body.profileIds) ? body.profileIds : []
  const profileIds: number[] = []
  for (const x of rawIds) {
    const n = typeof x === 'number' ? x : typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : NaN
    if (Number.isFinite(n)) profileIds.push(Math.floor(n))
  }
  if (profileIds.length === 0) {
    return Response.json({ error: 'profileIds required (non-empty number[])' }, { status: 400 })
  }
  if (profileIds.length > 12) {
    return Response.json({ error: 'At most 12 profiles per compare' }, { status: 400 })
  }

  const days = parseDays(body.days, 30)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const rows: Record<string, unknown>[] = []

  for (const pid of profileIds) {
    let profile: PipelineProfile
    try {
      profile = (await payload.findByID({
        collection: 'pipeline-profiles',
        id: String(pid),
        depth: 0,
        user: auth.user,
        overrideAccess: false,
      })) as PipelineProfile
      if (!profile?.id) continue
    } catch {
      continue
    }

    const tenantId = profileTenantNumeric(profile.tenant)
    if (!userMayAccessPipelineProfileTenant(auth.user, tenantId)) {
      continue
    }

    const report = await buildPipelineProfileReport({
      payload,
      profile: {
        id: profile.id,
        slug: profile.slug,
        name: profile.name,
        tenant: profile.tenant,
      },
      since,
    })

    rows.push({
      profileId: profile.id,
      name: profile.name,
      slug: profile.slug,
      report,
    })
  }

  return Response.json({ ok: true, days, count: rows.length, rows })
}
