'use client'

import type { AdminBrandingPublic } from '@/types/adminBrandingPublic'

/** Dedupe concurrent fetches only; each settled request allows a fresh fetch next time. */
let inFlight: Promise<AdminBrandingPublic> | null = null

export type FetchAdminBrandingOptions = {
  /** Skip in-flight dedupe and force a new network request (e.g. after tab becomes visible). */
  force?: boolean
}

export function fetchAdminBranding(
  options?: FetchAdminBrandingOptions,
): Promise<AdminBrandingPublic> {
  if (options?.force) {
    inFlight = null
  }
  if (inFlight) return inFlight

  const p = fetch('/api/admin/branding', {
    credentials: 'same-origin',
    cache: 'no-store',
  })
    .then((r) => {
      if (!r.ok) throw new Error('branding')
      return r.json() as Promise<AdminBrandingPublic>
    })
    .finally(() => {
      if (inFlight === p) inFlight = null
    })

  inFlight = p
  return p
}
