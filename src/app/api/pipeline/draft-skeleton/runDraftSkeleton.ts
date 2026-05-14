import type { Payload } from 'payload'

import type { Article } from '@/payload-types'
import { buildLexicalSkeleton } from '@/services/writing/skeletonBuilder'
import { tenantIdFromRelation } from '@/utilities/tenantScope'
import type { PipelineSettingShape } from '@/utilities/pipelineSettingShape'
import { normalizeSkeletonVariant } from '@/utilities/pipelineVariants'
import type { SkeletonVariantId } from '@/utilities/pipelineVariants'
import type { SerpOrganicBriefLine } from '@/utilities/serpBriefExtract'
import { pickSeoTitle } from '@/utilities/seoTitleWriter'
import { affiliateSeoFlowForMode, isAffiliateArticleLayout } from '@/utilities/affiliateSeoFlow'

function slugSectionId(term: string, idx: number): string {
  const raw = term
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
    .trim()
  return raw || `section_${idx}`
}

function slugifyArticleTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^brief:\s*/i, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .replace(/-+$/g, '')
}

function categoryMatchTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function scoreCategoryForKeyword(args: {
  keywordTerm: string
  keywordSlug: string
  categoryName: string
  categorySlug: string
  categoryKind?: string | null
}): number {
  const kwSlug = args.keywordSlug.trim().toLowerCase()
  const kwTerm = args.keywordTerm.trim().toLowerCase()
  const catSlug = args.categorySlug.trim().toLowerCase()
  const catName = args.categoryName.trim().toLowerCase()
  let score = 0
  if (kwSlug && catSlug === kwSlug) score += 100
  if (kwSlug && catSlug.includes(kwSlug)) score += 45
  if (kwTerm && catName.includes(kwTerm)) score += 45
  if (kwTerm && catSlug.includes(kwTerm.replace(/\s+/g, '-'))) score += 35
  const kwTokens = new Set(categoryMatchTokens(`${kwTerm} ${kwSlug}`))
  const catTokens = new Set(categoryMatchTokens(`${catName} ${catSlug}`))
  for (const token of kwTokens) {
    if (catTokens.has(token)) score += 12
  }
  if (args.categoryKind === 'guide') score += 4
  return score
}

async function uniqueArticleSlug(
  payload: Payload,
  args: { siteId?: number; locale: string; title: string },
): Promise<string> {
  const base = slugifyArticleTitle(args.title) || 'article'
  const clauses = (slug: string) => [
    { slug: { equals: slug } },
    { locale: { equals: args.locale } },
    ...(typeof args.siteId === 'number' && Number.isFinite(args.siteId) ?
      [{ site: { equals: args.siteId } }]
    : []),
  ]
  for (let i = 0; i < 20; i += 1) {
    const slug = i === 0 ? base : `${base}-${i + 1}`
    const found = await payload.find({
      collection: 'articles',
      where: { and: clauses(slug) },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (found.totalDocs === 0) return slug
  }
  return `${base}-${Date.now().toString(36)}`
}

async function existingArticleIdForBrief(
  payload: Payload,
  args: { briefIdNum: number; siteId?: number },
): Promise<number | null> {
  if (!Number.isFinite(args.briefIdNum)) return null
  const found = await payload.find({
    collection: 'articles',
    where: {
      and: [
        { sourceBrief: { equals: args.briefIdNum } },
        ...(typeof args.siteId === 'number' && Number.isFinite(args.siteId)
          ? [{ site: { equals: args.siteId } }]
          : []),
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const id = (found.docs[0] as { id?: unknown } | undefined)?.id
  if (typeof id === 'number' && Number.isFinite(id)) return Math.trunc(id)
  if (typeof id === 'string' && /^\d+$/.test(id.trim())) return Number(id.trim())
  return null
}

async function firstAuthorForSite(payload: Payload, siteId?: number): Promise<number | undefined> {
  if (typeof siteId !== 'number' || !Number.isFinite(siteId)) return undefined
  try {
    const r = await payload.find({
      collection: 'authors',
      where: { sites: { contains: siteId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const id = (r.docs[0] as { id?: unknown } | undefined)?.id
    return typeof id === 'number' && Number.isFinite(id) ? id : undefined
  } catch {
    return undefined
  }
}

async function bestCategoryForKeyword(payload: Payload, args: {
  siteId?: number
  locale: string
  primaryKeywordId?: number
  title: string
}): Promise<number | undefined> {
  if (typeof args.siteId !== 'number' || !Number.isFinite(args.siteId)) return undefined
  let keywordTerm = args.title
  let keywordSlug = slugifyArticleTitle(args.title)
  if (typeof args.primaryKeywordId === 'number' && Number.isFinite(args.primaryKeywordId)) {
    try {
      const kw = await payload.findByID({
        collection: 'keywords',
        id: String(args.primaryKeywordId),
        depth: 0,
        overrideAccess: true,
      })
      const term = (kw as { term?: unknown }).term
      const slug = (kw as { slug?: unknown }).slug
      if (typeof term === 'string' && term.trim()) keywordTerm = term.trim()
      if (typeof slug === 'string' && slug.trim()) keywordSlug = slug.trim()
    } catch {
      /* fallback to title */
    }
  }

  const categories = await payload.find({
    collection: 'categories',
    where: {
      and: [
        { site: { equals: args.siteId } },
        { locale: { equals: args.locale } },
      ],
    },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  let best: { id: number; score: number } | null = null
  for (const cat of categories.docs) {
    const id = typeof (cat as { id?: unknown }).id === 'number' ? (cat as { id: number }).id : null
    if (id == null) continue
    const score = scoreCategoryForKeyword({
      keywordTerm,
      keywordSlug,
      categoryName: String((cat as { name?: unknown }).name ?? ''),
      categorySlug: String((cat as { slug?: unknown }).slug ?? ''),
      categoryKind: typeof (cat as { kind?: unknown }).kind === 'string' ? (cat as { kind: string }).kind : null,
    })
    if (score > 0 && (!best || score > best.score)) best = { id, score }
  }
  return best?.id
}

async function loadPrimaryKeywordInfo(
  payload: Payload,
  primaryKeywordId?: number,
): Promise<{ term: string; slug: string }> {
  if (typeof primaryKeywordId !== 'number' || !Number.isFinite(primaryKeywordId)) {
    return { term: '', slug: '' }
  }
  try {
    const kw = await payload.findByID({
      collection: 'keywords',
      id: String(primaryKeywordId),
      depth: 0,
      overrideAccess: true,
    })
    return {
      term: typeof (kw as { term?: unknown }).term === 'string' ? (kw as { term: string }).term.trim() : '',
      slug: typeof (kw as { slug?: unknown }).slug === 'string' ? (kw as { slug: string }).slug.trim() : '',
    }
  } catch {
    return { term: '', slug: '' }
  }
}

async function loadClusterSectionRows(
  payload: Payload,
  siteId: number,
  pillarId: number,
): Promise<Array<{ id: number; term: string; volume: number }>> {
  const rows: Array<{ id: number; term: string; volume: number }> = []

  try {
    const direct = await payload.find({
      collection: 'keywords',
      where: {
        and: [
          { site: { equals: siteId } },
          {
            or: [{ id: { equals: pillarId } }, { pillar: { equals: pillarId } }],
          },
        ],
      },
      limit: 24,
      depth: 0,
      overrideAccess: true,
    })
    const seen = new Set<number>()
    for (const d of direct.docs) {
      const id = typeof (d as { id?: unknown }).id === 'number' ? (d as { id: number }).id : Number.NaN
      if (!Number.isFinite(id) || seen.has(id)) continue
      seen.add(id)
      const term = typeof (d as { term?: string }).term === 'string' ? (d as { term: string }).term : ''
      const vRaw = (d as { volume?: number | null }).volume
      const volume = typeof vRaw === 'number' && Number.isFinite(vRaw) ? vRaw : 0
      rows.push({ id, term: term.trim() || `kw_${id}`, volume })
    }
  } catch {
    return []
  }

  rows.sort((a, b) => b.volume - a.volume)
  return rows
}

function top10LinesFromBriefSources(sources: unknown): SerpOrganicBriefLine[] {
  if (!sources || typeof sources !== 'object' || Array.isArray(sources)) return []
  const serp = (sources as { serp?: unknown }).serp
  if (!serp || typeof serp !== 'object' || Array.isArray(serp)) return []
  const top = (serp as { organicTop10?: unknown }).organicTop10
  if (!Array.isArray(top)) return []
  const out: SerpOrganicBriefLine[] = []
  for (const row of top) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const rank = typeof r.rank === 'number' ? r.rank : Number(r.rank) || out.length + 1
    const title = typeof r.title === 'string' ? r.title : ''
    const url = typeof r.url === 'string' ? r.url : ''
    const domain = typeof r.domain === 'string' ? r.domain : ''
    const description = typeof r.description === 'string' ? r.description : null
    if (title || url) out.push({ rank, title, url, domain, description })
  }
  return out.slice(0, 10)
}

export type DraftSkeletonResult = { ok: true; articleId: number } | { ok: false; error: string; status?: number }

export async function runDraftSkeletonFromBrief(
  payload: Payload,
  args: {
    briefId: string | number
    siteIdOverride?: number | null
    merged: PipelineSettingShape
    keywordStrategyMode?: string
    affiliateContentRole?: string
    affiliatePageLayout?: string
  },
): Promise<DraftSkeletonResult> {
  const merged = args.merged
  const variant: SkeletonVariantId = normalizeSkeletonVariant(merged.skeletonVariant)

  const brief = await payload.findByID({
    collection: 'content-briefs',
    id: String(args.briefId),
    depth: 0,
    overrideAccess: true,
  })
  if (!brief) return { ok: false, error: 'brief not found', status: 404 }

  const briefNum =
    typeof args.briefId === 'number' && Number.isFinite(args.briefId) ? args.briefId : Number(args.briefId)
  const outline = (brief as { outline?: { sections?: { id: string }[]; globalContext?: unknown } }).outline
  const gc = outline?.globalContext as
    | { delegateOutline?: string; targetKeyword?: string; affiliateSeoFlow?: unknown }
    | undefined
  const briefFlow =
    gc?.affiliateSeoFlow && typeof gc.affiliateSeoFlow === 'object' && !Array.isArray(gc.affiliateSeoFlow)
      ? (gc.affiliateSeoFlow as Record<string, unknown>)
      : null
  const affiliateFlow = affiliateSeoFlowForMode(
    args.keywordStrategyMode ?? (typeof briefFlow?.keywordStrategyMode === 'string' ? briefFlow.keywordStrategyMode : undefined),
  )
  const affiliatePageLayout =
    isAffiliateArticleLayout(args.affiliatePageLayout)
      ? args.affiliatePageLayout
      : isAffiliateArticleLayout(briefFlow?.articleLayout)
        ? briefFlow.articleLayout
        : affiliateFlow.articleLayout
  let delegateOutline =
    typeof gc?.delegateOutline === 'string' && gc.delegateOutline.trim()
      ? gc.delegateOutline.trim().slice(0, 12000)
      : ''
  const priorTargetKw = typeof gc?.targetKeyword === 'string' ? gc.targetKeyword : ''

  const b = brief as {
    site?: number | { id: number } | null
    tenant?: number | { id: number } | null
    primaryKeyword?: number | { id: number } | null
    sources?: unknown
    title?: string
  }
  const siteId =
    args.siteIdOverride ??
    (typeof b.site === 'object' && b.site?.id != null
      ? b.site.id
      : typeof b.site === 'number'
        ? b.site
        : undefined)

  const existingArticleId = await existingArticleIdForBrief(payload, {
    briefIdNum: briefNum,
    siteId: typeof siteId === 'number' && Number.isFinite(siteId) ? siteId : undefined,
  })
  if (existingArticleId != null) return { ok: true, articleId: existingArticleId }

  let tenantId = tenantIdFromRelation(b.tenant)
  if (tenantId == null && typeof siteId === 'number' && Number.isFinite(siteId)) {
    try {
      const site = await payload.findByID({
        collection: 'sites',
        id: siteId,
        depth: 0,
        overrideAccess: true,
      })
      tenantId = tenantIdFromRelation((site as { tenant?: number | { id: number } | null }).tenant)
    } catch {
      tenantId = null
    }
  }
  if (tenantId == null) {
    return {
      ok: false,
      error:
        typeof siteId === 'number' && Number.isFinite(siteId)
          ? '所选站点未关联租户，无法从 Brief 生成文章草稿'
          : '无法解析租户：请确认内容大纲已关联租户或站点',
      status: 400,
    }
  }

  let pipelineProfileId: number | undefined
  if (typeof siteId === 'number' && Number.isFinite(siteId)) {
    try {
      const siteRow = await payload.findByID({
        collection: 'sites',
        id: String(siteId),
        depth: 0,
        overrideAccess: true,
      })
      const pp = (siteRow as { pipelineProfile?: number | { id: number } | null })?.pipelineProfile
      if (typeof pp === 'number' && Number.isFinite(pp)) pipelineProfileId = pp
      else if (pp && typeof pp === 'object' && 'id' in pp) {
        const id = (pp as { id: number }).id
        if (typeof id === 'number' && Number.isFinite(id)) pipelineProfileId = id
      }
    } catch {
      /* ignore */
    }
  }

  const pk =
    typeof b.primaryKeyword === 'object' && b.primaryKeyword?.id != null
      ? b.primaryKeyword.id
      : typeof b.primaryKeyword === 'number' && Number.isFinite(b.primaryKeyword)
        ? b.primaryKeyword
        : undefined

  if (variant === 'top10_blend' && b.sources) {
    const lines = top10LinesFromBriefSources(b.sources)
    if (lines.length > 0) {
      const block = lines.map((l) => `#${l.rank} ${l.title} (${l.domain || l.url})`).join('\n')
      delegateOutline = `${delegateOutline}\n\nSERP topical titles / competitors to reconcile (union & dedupe in your headings):\n${block}`.slice(
        0,
        12000,
      )
    }
  }

  let ids: string[] = outline?.sections?.map((s) => s.id) || ['intro', 'body', 'faq', 'conclusion']
  let outlineSectionsPayload:
    | Array<{ id: string; type: string; wordBudget?: number }>
    | undefined

  if (
    variant === 'cluster_driven' &&
    typeof siteId === 'number' &&
    Number.isFinite(siteId) &&
    pk != null &&
    Number.isFinite(pk)
  ) {
    const cluster = await loadClusterSectionRows(payload, siteId, pk)
    const picked = cluster.length > 0 ? cluster.slice(0, 12) : []
    if (picked.length >= 2) {
      ids = picked.map((r, i) => slugSectionId(r.term, i))
      outlineSectionsPayload = picked.map((r, i) => ({
        id: slugSectionId(r.term, i),
        type: 'custom',
        wordBudget: 550,
      }))
      const kwLine = picked.map((r) => `- ${r.term}`).join('\n')
      delegateOutline = `${delegateOutline}\n\nCluster keywords (one major H2 per line; internal coverage):\n${kwLine}`.slice(
        0,
        12000,
      )
    }
  }

  const lexical = buildLexicalSkeleton(ids)
  const briefTitle = (brief as { title?: string }).title || 'Article'
  const locale = 'en'
  const keywordInfo = await loadPrimaryKeywordInfo(payload, pk)
  const seoTitle = pickSeoTitle({
    keyword: keywordInfo.term || keywordInfo.slug,
    fallbackTitle: briefTitle.replace(/^Brief:\s*/i, ''),
  })
  const articleSlug = await uniqueArticleSlug(payload, {
    siteId: typeof siteId === 'number' && Number.isFinite(siteId) ? siteId : undefined,
    locale,
    title: keywordInfo.slug || keywordInfo.term || briefTitle,
  })
  const authorId = await firstAuthorForSite(
    payload,
    typeof siteId === 'number' && Number.isFinite(siteId) ? siteId : undefined,
  )
  const categoryId = await bestCategoryForKeyword(payload, {
    siteId: typeof siteId === 'number' && Number.isFinite(siteId) ? siteId : undefined,
    locale,
    primaryKeywordId: pk,
    title: keywordInfo.term || briefTitle,
  })
  const sectionSummaries: Record<string, unknown> =
    delegateOutline.length > 0 ? { globalContext: delegateOutline } : {}

  const art = await payload.create({
    collection: 'articles',
    draft: false,
    data: {
      title: seoTitle.title,
      slug: articleSlug,
      locale,
      tenant: tenantId,
      ...(typeof siteId === 'number' && Number.isFinite(siteId) ? { site: siteId } : {}),
      ...(authorId != null ? { author: authorId } : {}),
      ...(categoryId != null ? { categories: [categoryId] } : {}),
      ...(Number.isFinite(briefNum) ? { sourceBrief: briefNum } : {}),
      ...(pk != null ? { primaryKeyword: pk } : {}),
      affiliatePageLayout,
      ...(pipelineProfileId != null ? { pipelineProfile: pipelineProfileId } : {}),
      ...(Object.keys(sectionSummaries).length > 0 ? { sectionSummaries } : {}),
      meta: {
        title: seoTitle.title,
        description: seoTitle.description,
      },
      metaVariants: {
        startedAt: new Date().toISOString(),
        source: 'draft_skeleton_title_writer',
        championVariantId: seoTitle.id,
        variants: [seoTitle],
      },
      body: lexical as Article['body'],
      status: 'draft',
    },
  })

  if (variant === 'cluster_driven' && outlineSectionsPayload && outlineSectionsPayload.length >= 2) {
    try {
      await payload.update({
        collection: 'content-briefs',
        id: String(briefNum),
        data: {
          outline: {
            sections: outlineSectionsPayload,
            globalContext: { targetKeyword: priorTargetKw, delegateOutline },
          },
        },
        overrideAccess: true,
      })
    } catch {
      /* non-fatal */
    }
  }

  return { ok: true, articleId: typeof art.id === 'number' ? art.id : Number(art.id) }
}
