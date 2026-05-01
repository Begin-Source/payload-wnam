import type { AppLocale } from '@/i18n/config'

/**
 * Map amz-template-1 style paths to this app's `[locale]/(frontend)` routes and prefix locale.
 */
export function amzNavHref(locale: AppLocale, href: string): string {
  if (/^https?:\/\//i.test(href)) return href
  const h = href.startsWith('/') ? href : `/${href}`

  if (h.startsWith('/category/')) {
    const slug = h.slice('/category/'.length).split('/')[0] ?? ''
    if (!slug) return `/${locale}`
    return `/${locale}/categories/${encodeURIComponent(slug)}`
  }

  if (h.startsWith('/product/')) {
    const parts = h.slice('/product/'.length).split('/').filter(Boolean)
    const asin = parts[0] ?? ''
    if (!asin) return `/${locale}/products`
    return `/${locale}/product/${encodeURIComponent(asin)}`
  }

  const map: Record<string, string> = {
    '/': '/',
    '/products': '/products',
    '/reviews': '/reviews',
    '/guides': '/guides',
    '/about': '/about',
    '/contact': '/contact',
    '/privacy': '/privacy',
    '/terms': '/pages/terms',
    '/disclosure': '/pages/affiliate-disclosure',
    '/search': '/search',
  }

  const path = map[h] ?? h
  if (path === '/') return `/${locale}`
  return `/${locale}${path}`
}
