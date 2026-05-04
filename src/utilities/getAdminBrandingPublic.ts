import type { Payload } from 'payload'

import type { AdminBranding, Media } from '@/payload-types'
import type { AdminBrandingPublic } from '@/types/adminBrandingPublic'

export type { AdminBrandingPublic } from '@/types/adminBrandingPublic'

/**
 * Normalize admin primary color to `#rrggbb` or return null if invalid.
 */
export function normalizePrimaryColor(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const s = raw.trim()
  const m = s.match(/^#?([0-9a-fA-F]{6})$/)
  if (!m) return null
  return `#${m[1].toLowerCase()}`
}

export function toAbsoluteMediaUrl(url: string | null | undefined, requestOrigin: string): string | null {
  if (!url?.trim()) return null
  const u = url.trim()
  if (u.startsWith('http://') || u.startsWith('https://')) return u
  const path = u.startsWith('/') ? u : `/${u}`
  const base = requestOrigin.replace(/\/$/, '')
  return `${base}${path}`
}

export async function getAdminBrandingPublic(
  payload: Payload,
  options: { requestOrigin: string },
): Promise<AdminBrandingPublic> {
  const doc = (await payload.findGlobal({
    slug: 'admin-branding',
    depth: 1,
    overrideAccess: true,
  })) as AdminBranding

  const brandName = doc.brandName?.trim() || null
  const primaryColor = normalizePrimaryColor(doc.primaryColor ?? undefined)

  let logoUrl: string | null = null
  let logoUpdatedAt: string | null = null
  const logo = doc.logo
  if (logo && typeof logo === 'object' && 'url' in logo) {
    const m = logo as Media
    logoUrl = toAbsoluteMediaUrl(m.url, options.requestOrigin)
    const upd = m.updatedAt
    if (typeof upd === 'string' && upd.trim()) {
      logoUpdatedAt = upd.trim()
    } else if (m.id != null) {
      logoUpdatedAt = String(m.id)
    }
  }

  return { brandName, primaryColor, logoUrl, logoUpdatedAt }
}
