import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isUsersCollection } from '@/utilities/announcementAccess'
import type { Config } from '@/payload-types'
import { computeTeamStats, type TeamAdminStatsJson } from '@/utilities/teamStatsScope'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const payload = await getPayload({
    config: configPromise,
  })

  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ ok: false, error: 'Unauthorized' } satisfies TeamAdminStatsJson, {
      status: 401,
    })
  }

  const { id: idParam } = await context.params
  const idNum = Number(idParam)
  if (!Number.isFinite(idNum)) {
    return Response.json({ ok: false, error: 'Invalid id' } satisfies TeamAdminStatsJson, {
      status: 400,
    })
  }

  const userArg = user as Config['user'] & { collection: 'users' }

  let team: Record<string, unknown> | null = null
  try {
    team = (await payload.findByID({
      collection: 'teams',
      id: String(idNum),
      depth: 0,
      user: userArg,
      overrideAccess: false,
    })) as Record<string, unknown> | null
  } catch {
    return Response.json({ ok: false, error: 'Not found' } satisfies TeamAdminStatsJson, {
      status: 404,
    })
  }

  if (!team) {
    return Response.json({ ok: false, error: 'Not found' } satisfies TeamAdminStatsJson, {
      status: 404,
    })
  }

  const req = { user: userArg, payload }
  const metrics = await computeTeamStats(payload, req, team)

  const body: TeamAdminStatsJson = {
    ok: true,
    ...metrics,
  }

  return Response.json(body)
}
