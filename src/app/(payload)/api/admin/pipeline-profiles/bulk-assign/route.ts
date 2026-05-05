import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { PipelineProfile } from '@/payload-types'
import { tenantIdFromRelation } from '@/utilities/tenantScope'
import {
  pipelineProfileAdminAuth,
  profileTenantNumeric,
  userMayAccessPipelineProfileTenant,
} from '@/utilities/pipelineProfileAdminAccess'

export const dynamic = 'force-dynamic'

/** POST assign `pipelineProfile` on sites and/or articles (same tenant as profile) */
export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })

  const auth = pipelineProfileAdminAuth(user)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as {
    pipelineProfileId?: unknown
    siteIds?: unknown
    articleIds?: unknown
    clear?: unknown
  }

  const clear = body.clear === true
  const rawPid = body.pipelineProfileId
  const profileId =
    typeof rawPid === 'number' && Number.isFinite(rawPid) ?
      Math.floor(rawPid)
    : typeof rawPid === 'string' && /^\d+$/.test(rawPid) ?
      Number(rawPid)
    : NaN

  if (!clear && !Number.isFinite(profileId)) {
    return Response.json(
      { error: 'pipelineProfileId required (number) unless clear=true' },
      { status: 400 },
    )
  }

  let profileTenant: number | null = null
  if (!clear) {
    let profile: PipelineProfile
    try {
      profile = (await payload.findByID({
        collection: 'pipeline-profiles',
        id: String(profileId),
        depth: 0,
        user: auth.user,
        overrideAccess: false,
      })) as PipelineProfile
      if (!profile?.id) {
        return Response.json({ error: 'Profile not found' }, { status: 404 })
      }
    } catch {
      return Response.json({ error: 'Profile not found' }, { status: 404 })
    }
    profileTenant = profileTenantNumeric(profile.tenant)
    if (!userMayAccessPipelineProfileTenant(auth.user, profileTenant)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const siteIds = normalizeIdList(body.siteIds)
  const articleIds = normalizeIdList(body.articleIds)
  if (siteIds.length === 0 && articleIds.length === 0) {
    return Response.json({ error: 'siteIds and/or articleIds required (number[])' }, { status: 400 })
  }

  let sitesUpdated = 0
  let articlesUpdated = 0
  const errors: string[] = []

  for (const sid of siteIds) {
    try {
      const site = await payload.findByID({
        collection: 'sites',
        id: String(sid),
        depth: 0,
        user: auth.user,
        overrideAccess: false,
      })
      if (!site) {
        errors.push(`site ${sid}: not found`)
        continue
      }
      const st = tenantIdFromRelation(site.tenant as never)
      if (!clear) {
        if (st !== profileTenant) {
          errors.push(`site ${sid}: tenant mismatch`)
          continue
        }
        if (!userMayAccessPipelineProfileTenant(auth.user, st)) {
          errors.push(`site ${sid}: forbidden`)
          continue
        }
      } else {
        if (!userMayAccessPipelineProfileTenant(auth.user, st)) {
          errors.push(`site ${sid}: forbidden`)
          continue
        }
      }

      await payload.update({
        collection: 'sites',
        id: String(sid),
        data: {
          pipelineProfile: clear ? null : profileId,
        },
        user: auth.user,
        overrideAccess: false,
      })
      sitesUpdated += 1
    } catch (e) {
      errors.push(`site ${sid}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  for (const aid of articleIds) {
    try {
      const article = await payload.findByID({
        collection: 'articles',
        id: String(aid),
        depth: 0,
        user: auth.user,
        overrideAccess: false,
      })
      if (!article) {
        errors.push(`article ${aid}: not found`)
        continue
      }
      const at = tenantIdFromRelation(article.tenant as never)
      if (!clear) {
        if (at !== profileTenant) {
          errors.push(`article ${aid}: tenant mismatch`)
          continue
        }
        if (!userMayAccessPipelineProfileTenant(auth.user, at)) {
          errors.push(`article ${aid}: forbidden`)
          continue
        }
      } else {
        if (!userMayAccessPipelineProfileTenant(auth.user, at)) {
          errors.push(`article ${aid}: forbidden`)
          continue
        }
      }

      await payload.update({
        collection: 'articles',
        id: String(aid),
        data: {
          pipelineProfile: clear ? null : profileId,
        },
        user: auth.user,
        overrideAccess: false,
      })
      articlesUpdated += 1
    } catch (e) {
      errors.push(`article ${aid}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return Response.json({
    ok: true,
    clear,
    pipelineProfileId: clear ? null : profileId,
    sitesUpdated,
    articlesUpdated,
    ...(errors.length ? { errors } : {}),
  })
}

function normalizeIdList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  for (const x of raw) {
    const n = typeof x === 'number' ? x : typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : NaN
    if (Number.isFinite(n)) out.push(Math.floor(n))
  }
  return out
}
