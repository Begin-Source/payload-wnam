'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import { fetchAdminBranding } from '@/components/fetchAdminBranding'
import type { AdminBrandingPublic } from '@/types/adminBrandingPublic'
import { formatBrandDocumentTitle, stripPayloadProductSuffix } from '@/utilities/adminBrandingTitle'
import { applyAdminBrandingFaviconLinks } from '@/utilities/adminBrandingFavicon'

/** Payload often sets `document.title` after paint; stagger re-applies to win the race. */
const TITLE_RETRY_MS = [0, 50, 150, 300, 600, 1000] as const

const emptyBranding: AdminBrandingPublic = {
  brandName: null,
  primaryColor: null,
  logoUrl: null,
  logoUpdatedAt: null,
}

function applyBrandingToDocument(b: AdminBrandingPublic): void {
  const root = document.documentElement
  if (b.primaryColor) {
    root.setAttribute('data-admin-branding', 'true')
    root.style.setProperty('--admin-brand-primary', b.primaryColor)
    root.style.setProperty(
      '--admin-brand-primary-hover',
      `color-mix(in srgb, ${b.primaryColor} 82%, black)`,
    )
  } else {
    root.removeAttribute('data-admin-branding')
    root.style.removeProperty('--admin-brand-primary')
    root.style.removeProperty('--admin-brand-primary-hover')
  }
  if (b.logoUrl) {
    applyAdminBrandingFaviconLinks(b.logoUrl, b.logoUpdatedAt)
  }
}

/**
 * Applies CSS variables, favicon, and document title from public branding API.
 * Title: `admin-branding.brandName` overrides `NEXT_PUBLIC_ADMIN_BRAND_NAME`; if both empty,
 * strips the Payload product suffix only (see plan).
 * Mounted from `AdminBrandingProvider` (admin `components.providers`) so it runs for the whole admin shell, including login.
 */
export function AdminBrandingEffects(): null {
  const pathname = usePathname()
  /** `undefined` = branding fetch not settled yet */
  const [branding, setBranding] = useState<AdminBrandingPublic | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    const load = (force?: boolean) => {
      fetchAdminBranding(force ? { force: true } : undefined)
        .then((b) => {
          if (cancelled) return
          applyBrandingToDocument(b)
          setBranding(b)
        })
        .catch(() => {
          if (!cancelled) setBranding(emptyBranding)
        })
    }

    load()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        load(true)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    if (branding === undefined) return

    const effectiveBrand =
      branding.brandName?.trim() || process.env.NEXT_PUBLIC_ADMIN_BRAND_NAME?.trim() || ''

    const applyTitle = (): void => {
      const next = effectiveBrand
        ? formatBrandDocumentTitle(document.title, effectiveBrand)
        : stripPayloadProductSuffix(document.title)
      if (next !== document.title) {
        document.title = next
      }
    }

    const timeoutIds: number[] = []
    for (const ms of TITLE_RETRY_MS) {
      timeoutIds.push(
        window.setTimeout(() => {
          applyTitle()
        }, ms),
      )
    }

    const titleEl = document.querySelector('title')
    const mo = new MutationObserver(() => {
      applyTitle()
    })
    if (titleEl) {
      mo.observe(titleEl, { childList: true, subtree: true, characterData: true })
    }

    return () => {
      for (const id of timeoutIds) clearTimeout(id)
      mo.disconnect()
    }
  }, [branding, pathname])

  return null
}
