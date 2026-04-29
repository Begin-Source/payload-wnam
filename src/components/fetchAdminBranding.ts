'use client'

import type { AdminBrandingPublic } from '@/types/adminBrandingPublic'

let brandingPromise: Promise<AdminBrandingPublic> | null = null

export function fetchAdminBranding(): Promise<AdminBrandingPublic> {
  if (!brandingPromise) {
    brandingPromise = fetch('/api/admin/branding', { credentials: 'same-origin' })
      .then((r) => {
        if (!r.ok) throw new Error('branding')
        return r.json() as Promise<AdminBrandingPublic>
      })
      .catch((err) => {
        brandingPromise = null
        throw err
      })
  }
  return brandingPromise
}
