import type { OfferReviewGenContext } from '@/utilities/offerReviewMdx/buildOfferReviewContext'

export function buildOfferReviewPrompt(args: {
  templateMdx: string
  ctx: OfferReviewGenContext
}): string {
  const { templateMdx, ctx } = args
  const features = Array.isArray(ctx.features) ? ctx.features.filter(Boolean).map((f) => String(f).trim()) : []
  const topFeatures = features.slice(0, 8)
  const featureText = topFeatures.length ? topFeatures.join('; ') : ''
  const asin = ctx.asin || ''
  const amazonUrl = ctx.amazonUrl || ''
  const date = ctx.date

  return [
    'Write a complete MDX review using the template style below.',
    'Requirements:',
    '- Output ONLY MDX. No code fences.',
    '- Do not output LLM control tokens such as <bos>, <eos>, or <|...|>-style markers.',
    '- Keep the same section structure and tone as the template.',
    '- **Body must use Markdown only** (headings, lists, bold, links) — **no JSX or HTML tags** in the body.',
    '- Frontmatter fields must include: title, date, description, asin, brand, category, rating, image, amazonUrl, pros, cons.',
    '- Use the provided data. Do NOT change asin or amazonUrl.',
    `- Use date: ${date}`,
    '',
    'SEO title rules (very important):',
    '- Generate a NEW SEO title based on product features/benefits, not by copying the raw Amazon title.',
    '- Title should be concise: 8-14 words, ideally <= 85 characters.',
    '- Put the main keyword early, include one clear differentiator.',
    '- Avoid keyword stuffing, avoid full ALL CAPS.',
    '',
    'H1 heading rules:',
    '- The first markdown H1 (# ...) must be short and readable (<= 90 characters).',
    '- H1 should match or lightly expand frontmatter title.',
    '',
    'Template MDX (style reference):',
    templateMdx,
    '',
    'Product data (source of truth):',
    `raw_product_title: ${ctx.title || ''}`,
    `asin: ${asin}`,
    `brand: ${ctx.brand || ''}`,
    `category: ${ctx.category || ''}`,
    `rating: ${ctx.rating || ''}`,
    `image: ${ctx.imageUrl || ''}`,
    `amazonUrl: ${amazonUrl}`,
    `key_features: ${featureText}`,
    '',
    'If brand/category/description is missing, infer briefly from title/features.',
  ].join('\n')
}
