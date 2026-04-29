/**
 * Host header helpers for public landing: lowercase, strip port, optional `www.` canonical form.
 */

export function getRequestHost(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-host')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('host')
}

/** Lowercase host label without port (first segment of `host` header). */
export function normalizeHostForMatch(raw: string | null | undefined): string {
  if (!raw) return ''
  const lower = raw.trim().toLowerCase()
  const noPort = lower.split(':')[0] ?? lower
  return noPort.startsWith('www.') ? noPort.slice(4) : noPort
}

/** `www.example.com` and `example.com` both map to `example.com`. */
export function primaryDomainQueryVariants(canonicalHost: string): string[] {
  if (!canonicalHost) return []
  const withWww = `www.${canonicalHost}`
  return Array.from(new Set([canonicalHost, withWww]))
}

/** Hostname without port (`[::1]:3000` → `::1`). */
export function hostNameLabel(rawHost: string | null | undefined): string {
  if (!rawHost) return ''
  const t = rawHost.trim()
  if (t.startsWith('[')) {
    const end = t.indexOf(']')
    if (end > 0) return t.slice(1, end).toLowerCase()
  }
  return (t.split(':')[0] ?? '').toLowerCase()
}

export function isLocalDevelopmentHost(rawHost: string | null | undefined): boolean {
  const label = hostNameLabel(rawHost)
  return label === 'localhost' || label === '127.0.0.1' || label === '::1'
}
