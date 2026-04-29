'use client'

import React from 'react'

import { AdminBrandingEffects } from '@/components/AdminBrandingEffects'

export function AdminBrandingProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <>
      <AdminBrandingEffects />
      {children}
    </>
  )
}
