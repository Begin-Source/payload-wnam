import type { Site } from '@/payload-types'

/** n8n OpenRouter `en` output maps to these Payload `pages` slugs (same site, locale en). */
export const TRUST_BUNDLE_SLUGS = [
  'about',
  'contact',
  'privacy',
  'terms',
  'affiliate-disclosure',
] as const

export type TrustBundleSlug = (typeof TRUST_BUNDLE_SLUGS)[number]

export const CONTENT_KEY_BY_SLUG: Record<
  TrustBundleSlug,
  'about_content' | 'contact_content' | 'privacy_content' | 'terms_content' | 'disclosure_content'
> = {
  about: 'about_content',
  contact: 'contact_content',
  privacy: 'privacy_content',
  terms: 'terms_content',
  'affiliate-disclosure': 'disclosure_content',
}

export const TRUST_PAGE_TITLE: Record<TrustBundleSlug, string> = {
  about: 'About Us',
  contact: 'Contact Us',
  privacy: 'Privacy Policy',
  terms: 'Terms of Service',
  'affiliate-disclosure': 'Affiliate Disclosure',
}

export const SLUG_BY_CONTENT_KEY: Record<
  'about_content' | 'contact_content' | 'privacy_content' | 'terms_content' | 'disclosure_content',
  TrustBundleSlug
> = {
  about_content: 'about',
  contact_content: 'contact',
  privacy_content: 'privacy',
  terms_content: 'terms',
  disclosure_content: 'affiliate-disclosure',
}

export const TRUST_BUNDLE_LOCALE = 'en' as const

export function isTrustBundleEnPage(s?: {
  slug?: string | null
  locale?: string | null
}): boolean {
  if (s?.locale !== TRUST_BUNDLE_LOCALE) return false
  const slug = typeof s.slug === 'string' ? s.slug : ''
  return (TRUST_BUNDLE_SLUGS as readonly string[]).includes(slug)
}

export function supportEmailForSite(site: Site): string {
  const name = String(site.name ?? 'site')
  const d = String(site.primaryDomain ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
  if (d) return `support@${d}`
  return `support@${name.replace(/\s+/g, '').toLowerCase()}.com`
}
