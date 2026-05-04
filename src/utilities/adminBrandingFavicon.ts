/** MIME hint for favicon `<link type="...">` from URL (ignores query string). */
export function faviconMimeTypeFromUrl(url: string): string | undefined {
  const base = url.split(/[?#]/)[0]?.toLowerCase() ?? ''
  if (base.endsWith('.svg')) return 'image/svg+xml'
  if (base.endsWith('.png')) return 'image/png'
  if (base.endsWith('.ico')) return 'image/x-icon'
  if (base.endsWith('.webp')) return 'image/webp'
  return undefined
}

export function withFaviconCacheBuster(logoUrl: string, logoUpdatedAt: string | null): string {
  const v = encodeURIComponent(logoUpdatedAt?.trim() || '0')
  const sep = logoUrl.includes('?') ? '&' : '?'
  return `${logoUrl}${sep}v=${v}`
}

/**
 * Sync standard favicon links so Safari and others pick up admin branding uploads.
 */
export function applyAdminBrandingFaviconLinks(logoUrl: string, logoUpdatedAt: string | null): void {
  const href = withFaviconCacheBuster(logoUrl, logoUpdatedAt)
  const mime = faviconMimeTypeFromUrl(logoUrl)

  const ensure = (rel: string): void => {
    let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
    if (!link) {
      link = document.createElement('link')
      link.rel = rel
      document.head.appendChild(link)
    }
    link.href = href
    if (mime) link.setAttribute('type', mime)
    else link.removeAttribute('type')
  }

  ensure('icon')
  ensure('shortcut icon')
  ensure('apple-touch-icon')
}
