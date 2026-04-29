'use client'

import { PayloadIcon } from '@payloadcms/ui/shared'
import React, { useEffect, useState } from 'react'

import { fetchAdminBranding } from '@/components/fetchAdminBranding'
import type { AdminBrandingPublic } from '@/types/adminBrandingPublic'

export function AdminBrandingIcon(): React.ReactElement {
  const [branding, setBranding] = useState<AdminBrandingPublic | null | undefined>(undefined)

  useEffect(() => {
    fetchAdminBranding()
      .then(setBranding)
      .catch(() => setBranding(null))
  }, [])

  if (branding === undefined) {
    return <PayloadIcon />
  }
  if (branding?.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- admin branding upload
      <img
        alt=""
        className="graphic-icon admin-branding__icon"
        height="100%"
        src={branding.logoUrl}
        style={{ objectFit: 'contain' }}
        width="100%"
      />
    )
  }
  if (branding?.brandName) {
    return (
      <span aria-hidden className="graphic-icon admin-branding__icon-text">
        {branding.brandName.slice(0, 1).toUpperCase()}
      </span>
    )
  }
  return <PayloadIcon />
}
