import configPromise from '@payload-config'
import type { Payload } from 'payload'
import { getPayload } from 'payload'

import type { Offer } from '@/payload-types'
import { openrouterChatWithMeta } from '@/services/integrations/openrouter/chat'
import { buildOfferReviewGenContext } from '@/utilities/offerReviewMdx/buildOfferReviewContext'
import { buildOfferReviewPrompt } from '@/utilities/offerReviewMdx/buildOfferReviewPrompt'
import { extractOfferReviewFromLlm } from '@/utilities/offerReviewMdx/extractOfferReviewMdx'
import { loadOfferReviewTemplate } from '@/utilities/offerReviewMdx/loadOfferReviewTemplate'
import { ensureReviewSlugWithAsin } from '@/utilities/offerReviewMdx/offerReviewSlug'
import { upsertArticleFromOfferReview } from '@/utilities/offerReviewMdx/upsertArticleFromOfferReview'
import { incrementSiteQuotaUsage } from '@/utilities/siteQuotaCheck'
import { getTenantScopeForStats, type TenantScope } from '@/utilities/tenantScope'
import { assertUsersCollection } from '@/utilities/workflowQuickCreate'

export const dynamic = 'force-dynamic'

const OPENROUTER_EST_USD = 0.04

function tenantIdFromRelation(
  tenant: number | { id: number } | null | undefined,
): number | null {
  if (tenant == null || tenant === undefined) return null
  if (typeof tenant === 'number') return tenant
  if (typeof tenant === 'object' && typeof tenant.id === 'number') return tenant.id
  return null
}

function siteAccessible(scope: TenantScope, siteTenantId: number | null): boolean {
  if (scope.mode === 'all') return true
  if (scope.mode === 'none') return false
  if (siteTenantId == null) return false
  return scope.tenantIds.includes(siteTenantId)
}

async function resolveReviewAiModel(payload: Payload, override?: string): Promise<string> {
  if (override?.trim()) return override.trim()
  const env = process.env.OPENROUTER_OFFER_REVIEW_MODEL?.trim()
  if (env) return env
  try {
    const g = (await payload.findGlobal({
      slug: 'pipeline-settings',
      depth: 0,
    })) as { defaultLlmModel?: string | null }
    const m = g?.defaultLlmModel?.trim()
    if (m) return m
  } catch {
    /* ignore */
  }
  return 'google/gemini-2.5-flash-lite'
}

async function assertOfferAccess(
  payload: Payload,
  scope: TenantScope,
  offer: Offer,
): Promise<{ ok: true; siteId: number } | { ok: false; message: string }> {
  const sites = offer.sites
  if (!Array.isArray(sites) || sites.length === 0) {
    return { ok: false, message: 'Offer has no linked site' }
  }
  const s0 = sites[0]
  const siteId =
    typeof s0 === 'number' && Number.isFinite(s0) ?
      s0
    : s0 && typeof s0 === 'object' && 'id' in s0 ?
      Number((s0 as { id: number }).id)
    : NaN
  if (!Number.isFinite(siteId)) {
    return { ok: false, message: 'Invalid site on offer' }
  }
  const siteRow = await payload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 0,
  })
  if (!siteRow) {
    return { ok: false, message: 'Site not found' }
  }
  const siteTenantId = tenantIdFromRelation(
    (siteRow as { tenant?: number | { id: number } | null }).tenant,
  )
  if (!siteAccessible(scope, siteTenantId)) {
    return { ok: false, message: 'Forbidden for this tenant' }
  }
  return { ok: true, siteId }
}

/**
 * POST { offerIds: number[], aiModel?: string, createArticle?: boolean, locale?: string }
 */
export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  try {
    assertUsersCollection(user)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    offerIds?: unknown
    aiModel?: unknown
    createArticle?: unknown
    locale?: unknown
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const rawIds = body.offerIds
  const offerIds: number[] =
    Array.isArray(rawIds) ?
      rawIds
        .map((x) => (typeof x === 'number' ? x : Number(x)))
        .filter((n) => Number.isFinite(n) && n > 0)
    : []

  if (offerIds.length === 0) {
    return Response.json({ error: 'offerIds must be a non-empty array' }, { status: 400 })
  }

  if (offerIds.length > 40) {
    return Response.json({ error: 'offerIds max 40 per request' }, { status: 400 })
  }

  const createArticle =
    body.createArticle === true || body.createArticle === 1 || body.createArticle === 'true'
  const locale =
    typeof body.locale === 'string' && body.locale.trim() ? body.locale.trim() : 'en'
  const aiOverride = typeof body.aiModel === 'string' ? body.aiModel : undefined

  const model = await resolveReviewAiModel(payload, aiOverride)
  let templateMdx: string
  try {
    templateMdx = loadOfferReviewTemplate()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return Response.json(
      { error: `Failed to load review MDX template: ${msg}` },
      { status: 500 },
    )
  }
  const scope = getTenantScopeForStats(user)

  const results: {
    offerId: number
    ok: boolean
    error?: string
    articleId?: number
    articleCreated?: boolean
  }[] = []

  for (const offerId of offerIds) {
    const now = new Date().toISOString()
    try {
      const offerDoc = await payload.findByID({
        collection: 'offers',
        id: offerId,
        depth: 1,
      })
      if (!offerDoc) {
        results.push({ offerId, ok: false, error: 'Offer not found' })
        continue
      }
      const offer = offerDoc as Offer

      const access = await assertOfferAccess(payload, scope, offer)
      if (!access.ok) {
        results.push({ offerId, ok: false, error: access.message })
        continue
      }

      await payload.update({
        collection: 'offers',
        id: offerId,
        data: {
          reviewDraft: {
            workflowStatus: 'running',
            workflowUpdatedAt: now,
            workflowLog: 'Review MDX generation started…',
          },
        },
        overrideAccess: true,
      })

      const ctx = buildOfferReviewGenContext(offer)
      const prompt = buildOfferReviewPrompt({ templateMdx, ctx })

      const { text: llmText, finishReason } = await openrouterChatWithMeta(
        model,
        [
          {
            role: 'system',
            content:
              'You are an expert Amazon affiliate review writer and SEO editor. Output only valid MDX with YAML frontmatter. Generate concise, high-CTR, feature-driven titles. Never output LLM control tokens such as <bos>, <eos>, or arbitrary bracket-only markers.',
          },
          { role: 'user', content: prompt },
        ],
        { maxTokens: 4096, temperature: 0.35 },
      )

      const extracted = extractOfferReviewFromLlm(llmText, ctx)
      const finalSlug = ensureReviewSlugWithAsin({
        title: extracted.meta.title,
        asin: extracted.meta.asin,
        existingReviewSlug: ctx.reviewSlug,
      })

      await payload.update({
        collection: 'offers',
        id: offerId,
        data: {
          reviewDraft: {
            mdx: extracted.safeMdx,
            slug: finalSlug,
            status: 'ready',
            workflowStatus: 'done',
            workflowUpdatedAt: new Date().toISOString(),
            workflowLog:
              `OK · model ${model}${finishReason && finishReason !== 'stop' ? ` · finish:${finishReason}` : ''}`,
          },
        },
        overrideAccess: true,
      })

      let articleId: number | undefined
      let articleCreated: boolean | undefined
      if (createArticle) {
        const ar = await upsertArticleFromOfferReview({
          payload,
          offer,
          extracted,
          reviewSlug: finalSlug,
          locale,
        })
        articleId = ar.articleId
        articleCreated = ar.created
      }

      await incrementSiteQuotaUsage(payload, access.siteId, { openrouterUsd: OPENROUTER_EST_USD })

      results.push({
        offerId,
        ok: true,
        articleId,
        articleCreated,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await payload
        .update({
          collection: 'offers',
          id: offerId,
          data: {
            reviewDraft: {
              workflowStatus: 'error',
              workflowUpdatedAt: new Date().toISOString(),
              workflowLog: msg.slice(0, 4000),
            },
          },
          overrideAccess: true,
        })
        .catch(() => {})
      results.push({ offerId, ok: false, error: msg })
    }
  }

  const okCount = results.filter((r) => r.ok).length
  return Response.json({
    ok: okCount === results.length,
    model,
    createArticle,
    results,
    okCount,
    total: results.length,
  })
}
