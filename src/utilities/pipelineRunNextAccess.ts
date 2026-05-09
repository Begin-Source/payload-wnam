import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Config } from '@/payload-types'
import { userHasPipelineRunNextAccess } from '@/utilities/userRoles'
import { assertUsersCollection } from '@/utilities/workflowQuickCreate'

export async function requirePipelineRunNextAccess(request: Request): Promise<
  | { ok: false; response: Response }
  | {
      ok: true
      payload: Awaited<ReturnType<typeof getPayload>>
      user: Config['user'] & { collection: 'users' }
    }
> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  try {
    assertUsersCollection(user)
  } catch {
    return {
      ok: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }
  if (!userHasPipelineRunNextAccess(user)) {
    return {
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }
  return { ok: true, payload, user }
}
