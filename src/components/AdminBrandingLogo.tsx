'use client'

import { PayloadLogo } from '@payloadcms/ui/shared'
import React, { useEffect, useState } from 'react'

import { fetchAdminBranding } from '@/components/fetchAdminBranding'
import type { AdminBrandingPublic } from '@/types/adminBrandingPublic'
import { withFaviconCacheBuster } from '@/utilities/adminBrandingFavicon'

export function AdminBrandingLogo(): React.ReactElement {
  const [branding, setBranding] = useState<AdminBrandingPublic | null | undefined>(undefined)

  useEffect(() => {
    fetchAdminBranding()
      .then(setBranding)
      .catch(() => setBranding(null))
  }, [])

  let content: React.ReactNode
  if (branding === undefined) {
    content = <PayloadLogo />
  } else if (branding?.logoUrl) {
    content = (
      // R2 / API URLs are dynamic; next/image would require host allowlisting per deploy.
      // eslint-disable-next-line @next/next/no-img-element -- admin branding upload
      <img
        className="graphic-logo admin-branding__logo"
        src={withFaviconCacheBuster(branding.logoUrl, branding.logoUpdatedAt)}
        alt={branding.brandName || ''}
      />
    )
  } else if (branding?.brandName) {
    content = <span className="graphic-logo admin-branding__logo-text">{branding.brandName}</span>
  } else {
    content = <PayloadLogo />
  }

  return <>{content}</>
}
