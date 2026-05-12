import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { runScheduledPublish } from '@/utilities/runScheduledPublish'

export const dynamic = 'force-dynamic'

const PATH = '/api/pipeline/scheduled-publish'

function num(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.floor(raw)
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) return Number(raw.trim())
  if (raw && typeof raw === 'object' && 'id' in raw) return num((raw as { id?: unknown }).id)
  return null
}

function numberOr(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

/**
 * Cron-safe publisher. Publishes due queued articles if they still pass checks and site daily caps.
 */
export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const payload = await getPayload({ config: configPromise })
  const limit = numberOr(body.limit, 20, 1, 100)
  const siteFilter = num(body.siteId)
  const minQualityScore = numberOr(body.minQualityScore, 80, 50, 100)
  return Response.json(await runScheduledPublish(payload, {
    siteId: siteFilter,
    limit,
    minQualityScore,
  }))
}
