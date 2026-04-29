import type { Payload } from 'payload'

/**
 * Resolves the default Amazon affiliate network id for merchant-seeded offers.
 * Order: `DEFAULT_AMAZON_AFFILIATE_NETWORK_ID` → first network whose slug contains `amazon` → first network row.
 */
export async function resolveDefaultAmazonAffiliateNetworkId(payload: Payload): Promise<number> {
  const env = process.env.DEFAULT_AMAZON_AFFILIATE_NETWORK_ID?.trim()
  if (env && /^\d+$/.test(env)) return Number(env)

  const bySlug = await payload.find({
    collection: 'affiliate-networks',
    where: { slug: { contains: 'amazon' } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (bySlug.docs[0]?.id != null) return bySlug.docs[0].id as number

  const any = await payload.find({
    collection: 'affiliate-networks',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (!any.docs.length) {
    throw new Error(
      'No affiliate-networks document and DEFAULT_AMAZON_AFFILIATE_NETWORK_ID is unset',
    )
  }
  return any.docs[0].id as number
}
