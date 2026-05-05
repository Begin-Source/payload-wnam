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

function parseDays(v: string | null, fallback: number): number {
  if (v == null || v === '') return fallback
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(365 * 2, Math.max(1, Math.floor(n)))
}

/** GET `/api/admin/pipeline-profiles/:id/report?days=` — KPI 汇总（工单 + snapshot 文章） */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })

  const auth = pipelineProfileAdminAuth(user)
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  if (!/^\d+$/.test(id)) {
    return Response.json({ error: 'Invalid profile id' }, { status: 400 })
  }
  const profileId = Number(id)

  let profile: PipelineProfile
  try {
    profile = (await payload.findByID({
      collection: 'pipeline-profiles',
      id,
      depth: 0,
      user: auth.user,
      overrideAccess: false,
    })) as PipelineProfile
    if (!profile?.id) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
  } catch {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const tenantId = profileTenantNumeric(profile.tenant)
  if (!userMayAccessPipelineProfileTenant(auth.user, tenantId)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const days = parseDays(url.searchParams.get('days'), 30)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const report = await buildPipelineProfileReport({
    payload,
    profile: {
      id: profileId,
      slug: profile.slug,
      name: profile.name,
      tenant: profile.tenant,
    },
    since,
  })

  return Response.json({ ok: true, profileId: profile.id, days, report })
}
