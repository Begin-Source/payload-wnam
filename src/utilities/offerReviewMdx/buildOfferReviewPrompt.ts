import type { OfferReviewGenContext } from '@/utilities/offerReviewMdx/buildOfferReviewContext'
import {
  buildOfferReviewMdxPromptDefaults,
  buildOfferReviewMdxPromptVars,
} from '@/utilities/openRouterTenantPrompts/defaultOpenRouterTenantPromptBodies'

export function buildOfferReviewMdxPromptVarsFromContext(
  templateMdx: string,
  ctx: OfferReviewGenContext,
): Record<string, string> {
  const features = Array.isArray(ctx.features) ? ctx.features.filter(Boolean).map((f) => String(f).trim()) : []
  const topFeatures = features.slice(0, 8)
  const featureText = topFeatures.length ? topFeatures.join('; ') : ''
  return buildOfferReviewMdxPromptVars({
    template_mdx: templateMdx,
    date: ctx.date,
    raw_product_title: ctx.title || '',
    asin: ctx.asin || '',
    brand: ctx.brand || '',
    category: ctx.category || '',
    rating: ctx.rating === '' ? '' : String(ctx.rating),
    image: ctx.imageUrl || '',
    amazon_url: ctx.amazonUrl || '',
    key_features: featureText,
  })
}

export function buildOfferReviewMdxResolvedDefaults(templateMdx: string, ctx: OfferReviewGenContext): {
  system: string
  user: string
} {
  const vars = buildOfferReviewMdxPromptVarsFromContext(templateMdx, ctx)
  return buildOfferReviewMdxPromptDefaults(vars)
}

export function buildOfferReviewPrompt(args: { templateMdx: string; ctx: OfferReviewGenContext }): string {
  return buildOfferReviewMdxResolvedDefaults(args.templateMdx, args.ctx).user
}
