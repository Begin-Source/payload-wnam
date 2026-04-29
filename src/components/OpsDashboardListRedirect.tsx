'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * 「看板」集合列表页：直接进入 `/admin` 运营看板。
 */
export function OpsDashboardListRedirect(): React.ReactElement {
  const router = useRouter()

  useEffect(() => {
    router.replace('/admin')
  }, [router])

  return (
    <div className="payload__page-header" style={{ padding: 'var(--base)' }}>
      <p className="payload__page-header-title">正在打开看板…</p>
    </div>
  )
}
