import configPromise from '@payload-config'
import { getPayload } from 'payload'

import {
  assertUsersCollection,
  createWorkflowQuickJob,
  parseWorkflowQuickBody,
} from '@/utilities/workflowQuickCreate'

export const dynamic = 'force-dynamic'

function mapError(e: unknown): { status: number; message: string } {
  if (!(e instanceof Error)) {
    return { status: 500, message: 'Internal error' }
  }
  const m = e.message
  if (m === 'SITE_NOT_FOUND') return { status: 404, message: 'Site not found' }
  if (m === 'FORBIDDEN_SITE') return { status: 403, message: 'Forbidden' }
  if (m === 'FORBIDDEN_CATEGORY') return { status: 403, message: 'Forbidden category' }
  if (m.startsWith('CATEGORY_NOT_FOUND:')) return { status: 400, message: 'Category not found' }
  if (m.startsWith('CATEGORY_TENANT_MISMATCH:')) {
    return { status: 400, message: 'Category does not belong to site tenant' }
  }
  if (m === 'UNAUTHORIZED') return { status: 401, message: 'Unauthorized' }
  return { status: 500, message: m || 'Internal error' }
}

export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({
    config: configPromise,
  })

  const { user } = await payload.auth({ headers: request.headers })
  try {
    assertUsersCollection(user)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseWorkflowQuickBody(body)
  if ('error' in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 })
  }

  try {
    const result = await createWorkflowQuickJob({
      payload,
      user,
      kind: parsed.kind,
      siteId: parsed.siteId,
      categoryIds: parsed.categoryIds,
      topic: parsed.topic,
    })
    return Response.json({ id: result.id })
  } catch (e) {
    const { status, message } = mapError(e)
    return Response.json({ error: message }, { status })
  }
}
