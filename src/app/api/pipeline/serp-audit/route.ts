import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { dataForSeoPost } from '@/services/integrations/dataforseo/client'
import { resolveDfsLocationLanguageFromMerged } from '@/utilities/pipelineDfsLocale'
import { resolveMergedForPipelineRoute } from '@/utilities/resolvePipelineConfig'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/serp-audit'

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as {
    q?: string
    siteId?: number
    tenantId?: number
  }
  if (!body.q) {
    return Response.json({ error: 'q required' }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })
  const merged = await resolveMergedForPipelineRoute({
    payload,
    siteId: body.siteId ?? null,
    tenantId: body.tenantId ?? null,
  })
  if (!merged.dataForSeoEnabled) {
    return Response.json(
      { ok: false, error: 'DataForSEO disabled in pipeline-settings / profile' },
      { status: 400 },
    )
  }

  const loc = resolveDfsLocationLanguageFromMerged(merged)

  try {
    const r = await dataForSeoPost('/v3/serp/google/organic/live/advanced', [
      {
        language_code: loc.language_code,
        location_code: loc.location_code,
        keyword: body.q,
      },
    ])
    return Response.json({ ok: true, r })
  } catch (e) {
    return Response.json({ ok: false, message: e instanceof Error ? e.message : String(e) })
  }
}
