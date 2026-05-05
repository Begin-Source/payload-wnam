import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { PipelineProfile } from '@/payload-types'
import { buildPipelineProfileClonePayload } from '@/utilities/pipelineProfileCloneData'
import {
  pipelineProfileAdminAuth,
  profileTenantNumeric,
  userMayAccessPipelineProfileTenant,
} from '@/utilities/pipelineProfileAdminAccess'

export const dynamic = 'force-dynamic'

/** POST `{ name?, slug? }` — duplicate profile fields; slug must stay unique within tenant */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })

  const auth = pipelineProfileAdminAuth(user)
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  if (!/^\d+$/.test(id)) {
    return Response.json({ error: 'Invalid profile id' }, { status: 400 })
  }

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

  const body = (await request.json().catch(() => ({}))) as {
    name?: unknown
    slug?: unknown
  }

  const bodySlugRaw = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  const bodySlug = bodySlugRaw.replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '')
  const nextSlug = bodySlug || `${profile.slug}-copy-${Date.now().toString(36)}`

  try {
    const created = await payload.create({
      collection: 'pipeline-profiles',
      data: buildPipelineProfileClonePayload(profile, {
        name:
          typeof body.name === 'string' && body.name.trim() ?
            body.name.trim()
          : `${profile.name}（副本）`,
        slug: nextSlug,
        isDefault: false,
      }),
      user: auth.user,
      overrideAccess: false,
    })
    return Response.json({
      ok: true,
      id: created.id,
      slug: typeof created.slug === 'string' ? created.slug : nextSlug,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return Response.json({ ok: false, error: msg }, { status: 422 })
  }
}
