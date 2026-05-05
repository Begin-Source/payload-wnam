'use client'

import Link from 'next/link'
import React from 'react'

/** List header shortcut for `pipeline-profiles`. */
export function PipelineProfilesListActions(): React.ReactElement {
  return (
    <Link
      href="/admin/pipeline-profiles/compare"
      style={{
        display: 'inline-block',
        padding: '0.35rem 0.75rem',
        borderRadius: 4,
        border: '1px solid var(--theme-elevation-150)',
        fontSize: '0.8125rem',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      横向对比 KPI
    </Link>
  )
}
