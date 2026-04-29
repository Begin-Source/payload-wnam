import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/meta-ab-pick'

type Variant = { id: string; title: string; description: string }

type MetaVariantsState = {
  startedAt?: string
  variants?: Variant[]
  experimentDays?: number
  championVariantId?: string
  pickedAt?: string
  pickReason?: string
}

/**
 * 钉子 5：在未接 GSC 时按确定性规则选冠军并写回 `meta` + `metaVariants`。
 * 有 GSC CTR 后可改为比较各 variant 的点击率再调用本接口。
 */
export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as { articleId?: string | number }
  if (body.articleId == null) {
    return Response.json({ error: 'articleId required' }, { status: 400 })
  }
  const payload = await getPayload({ config: configPromise })
  const id = typeof body.articleId === 'number' ? body.articleId : Number(body.articleId)
  if (!Number.isFinite(id)) {
    return Response.json({ error: 'articleId invalid' }, { status: 400 })
  }

  const article = await payload.findByID({ collection: 'articles', id: String(id), depth: 0 })
  const mv = (article as { metaVariants?: MetaVariantsState | null }).metaVariants
  const variants = Array.isArray(mv?.variants) ? mv!.variants! : []
  if (variants.length === 0) {
    return Response.json({ error: 'article has no metaVariants.variants; run meta-ab-optimize first' }, { status: 400 })
  }

  // Deterministic rotation: stable hash from id + ISO week number (no GSC).
  const week = (() => {
    const d = new Date()
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    const day = t.getUTCDay() || 7
    t.setUTCDate(t.getUTCDate() + 4 - day)
    const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
    return Math.ceil(((t.getTime() - y.getTime()) / 86400000 + 1) / 7)
  })()
  const idx = (id + week) % variants.length
  const winner = variants[idx]!

  const nextMv: MetaVariantsState = {
    ...mv,
    championVariantId: winner.id,
    pickedAt: new Date().toISOString(),
    pickReason: 'deterministic_weekly_rotation_no_gsc',
  }

  await payload.update({
    collection: 'articles',
    id,
    data: {
      meta: {
        title: winner.title,
        description: winner.description,
      },
      metaVariants: nextMv as Record<string, unknown>,
    },
    overrideAccess: true,
  })

  return Response.json({
    ok: true,
    articleId: id,
    winnerVariantId: winner.id,
    note: 'GSC CTR not used; winner chosen by stable id+week index. Wire GSC to replace heuristic.',
    handoff: { status: 'DONE', recommendedNextSkill: '' },
  })
}
