'use client'

import { AdminBackgroundActivityProvider } from '@/components/adminBackgroundActivity/AdminBackgroundActivityProvider'
import { AdminBrandingEffects } from '@/components/AdminBrandingEffects'
import React from 'react'

export function AdminBrandingProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <AdminBackgroundActivityProvider>
      <AdminBrandingEffects />
      {children}
    </AdminBackgroundActivityProvider>
  )
}
