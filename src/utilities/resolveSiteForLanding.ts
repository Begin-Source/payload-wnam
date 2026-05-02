import type { Payload } from 'payload'

import type { Site } from '@/payload-types'

import {
  isLocalDevelopmentHost,
  normalizeHostForMatch,
  primaryDomainQueryVariants,
} from '@/utilities/normalizeRequestHost'
import { publicSiteThemeSelectWithoutT1 } from '@/utilities/publicSiteThemeSelect'

function warnDuplicate(payload: Payload, msg: string, extra: Record<string, unknown>) {
  if (typeof payload.logger?.warn === 'function') {
    payload.logger.warn({ msg, ...extra })
  }
}

async function findSiteBySlug(payload: Payload, slug: string): Promise<Site | null> {
  const active = await payload.find({
    collection: 'sites',
    where: {
      and: [{ slug: { equals: slug } }, { status: { equals: 'active' } }],
    },
    limit: 10,
    depth: 1,
    select: publicSiteThemeSelectWithoutT1,
    overrideAccess: true,
  })
  if (active.docs.length > 1) {
    warnDuplicate(payload, 'multiple active sites for slug', { slug, count: active.docs.length })
  }
  if (active.docs[0]) {
    return active.docs[0] as Site
  }

  const anyStatus = await payload.find({
    collection: 'sites',
    where: { slug: { equals: slug } },
    limit: 10,
    depth: 1,
    select: publicSiteThemeSelectWithoutT1,
    overrideAccess: true,
  })
  if (anyStatus.docs.length > 1) {
    warnDuplicate(payload, 'multiple sites for slug', { slug, count: anyStatus.docs.length })
  }
  return (anyStatus.docs[0] as Site | undefined) ?? null
}

async function findSiteByPrimaryDomain(payload: Payload, canonicalHost: string): Promise<Site | null> {
  const variants = primaryDomainQueryVariants(canonicalHost)
  if (variants.length === 0) return null

  const orClause = variants.map((v) => ({ primaryDomain: { equals: v } }))

  const active = await payload.find({
    collection: 'sites',
    where: {
      and: [{ or: orClause }, { status: { equals: 'active' } }],
    },
    limit: 10,
    depth: 1,
    select: publicSiteThemeSelectWithoutT1,
    overrideAccess: true,
  })
  if (active.docs.length > 1) {
    warnDuplicate(payload, 'multiple active sites for primaryDomain', {
      canonicalHost,
      variants,
      count: active.docs.length,
    })
  }
  if (active.docs[0]) {
    return active.docs[0] as Site
  }

  const anyStatus = await payload.find({
    collection: 'sites',
    where: { or: orClause },
    limit: 10,
    depth: 1,
    select: publicSiteThemeSelectWithoutT1,
    overrideAccess: true,
  })
  if (anyStatus.docs.length > 1) {
    warnDuplicate(payload, 'multiple active sites for primaryDomain (non-active)', {
      canonicalHost,
      variants,
      count: anyStatus.docs.length,
    })
  }
  return (anyStatus.docs[0] as Site | undefined) ?? null
}

/**
 * Resolves a `sites` row for the public home: non-local hosts match `primaryDomain`;
 * localhost / 127.0.0.1 use `x-site-slug` (from `?site=`) or `NEXT_PUBLIC_DEFAULT_SITE_SLUG`.
 */
export async function resolveSiteForLanding(
  payload: Payload,
  args: {
    rawHost: string
    siteSlugFromHeader: string
  },
): Promise<Site | null> {
  const { rawHost, siteSlugFromHeader } = args

  if (isLocalDevelopmentHost(rawHost)) {
    const slug =
      siteSlugFromHeader.trim() || process.env.NEXT_PUBLIC_DEFAULT_SITE_SLUG?.trim() || ''
    if (!slug) return null
    return findSiteBySlug(payload, slug)
  }

  const canonical = normalizeHostForMatch(rawHost)
  if (!canonical) return null
  return findSiteByPrimaryDomain(payload, canonical)
}
