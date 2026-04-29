/**
 * Derive a URL-safe site slug from a hostname: lowercase, trim, dots → hyphens.
 */
export function domainToSlug(domain: string): string {
  return String(domain ?? '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '-')
}
