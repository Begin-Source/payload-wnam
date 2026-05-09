import { requirePipelineRunNextAccess } from '@/utilities/pipelineRunNextAccess'
import { parseCommaSeparatedPositiveInts } from '@/utilities/writingScopeLabelQuery'

export const dynamic = 'force-dynamic'

type LabelRow = { id: number; title: string }

/** GET — titles for content-briefs / articles ids (Pipeline staff only); for scoped pipeline picker UI. */
export async function GET(request: Request): Promise<Response> {
  const g = await requirePipelineRunNextAccess(request)
  if (!g.ok) {
    return g.response
  }

  const url = new URL(request.url)
  const briefIds = parseCommaSeparatedPositiveInts(url.searchParams.get('briefIds'))
  const articleIds = parseCommaSeparatedPositiveInts(url.searchParams.get('articleIds'))

  if (briefIds.length === 0 && articleIds.length === 0) {
    return Response.json({ ok: true, briefs: [] as LabelRow[], articles: [] as LabelRow[] })
  }

  const { payload, user } = g

  const briefs: LabelRow[] = []
  const articles: LabelRow[] = []

  try {
    if (briefIds.length > 0) {
      const r = await payload.find({
        collection: 'content-briefs',
        where: { id: { in: briefIds } },
        limit: briefIds.length,
        depth: 0,
        select: { title: true },
        overrideAccess: false,
        user,
      })
      for (const d of r.docs) {
        const id = typeof d.id === 'number' ? d.id : Number(d.id)
        if (!Number.isFinite(id)) continue
        const titleRaw = (d as { title?: string | null }).title
        const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : `#${id}`
        briefs.push({ id, title })
      }
      briefs.sort((a, b) => a.id - b.id)
    }

    if (articleIds.length > 0) {
      const r = await payload.find({
        collection: 'articles',
        where: { id: { in: articleIds } },
        limit: articleIds.length,
        depth: 0,
        select: { title: true },
        overrideAccess: false,
        user,
      })
      for (const d of r.docs) {
        const id = typeof d.id === 'number' ? d.id : Number(d.id)
        if (!Number.isFinite(id)) continue
        const titleRaw = (d as { title?: string | null }).title
        const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : `#${id}`
        articles.push({ id, title })
      }
      articles.sort((a, b) => a.id - b.id)
    }

    return Response.json({ ok: true, briefs, articles })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return Response.json(
      { ok: false, error: '加载标签失败', errorDetail: msg.slice(0, 400) },
      { status: 500 },
    )
  }
}
