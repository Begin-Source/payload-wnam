/**
 * Preserve `?site=` on localhost when navigating internally (middleware reads it from query).
 */
export function appendAmzSite(href: string, site: string | null | undefined): string {
  if (!site?.trim()) return href
  if (/^https?:\/\//i.test(href)) return href
  if (/[?&]site=/.test(href)) return href
  const sep = href.includes('?') ? '&' : '?'
  return `${href}${sep}site=${encodeURIComponent(site.trim())}`
}
