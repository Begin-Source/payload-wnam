'use client'

import Link from 'next/link'
import React from 'react'

const wrap: React.CSSProperties = {
  marginBottom: 'var(--base)',
  padding: '0.65rem var(--base)',
  borderRadius: 4,
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-50)',
  fontSize: '0.875rem',
  lineHeight: 1.45,
}

/**
 * Shown above the `teams` list table: entry to the team performance board.
 * `prefetch={false}` reduces prefetch/chunk edge cases inside Payload Admin.
 */
export function TeamPerformanceListLink(): React.ReactElement {
  return (
    <div style={wrap}>
      <Link href="/admin/teams/performance" prefetch={false} style={{ fontWeight: 600 }}>
        打开团队绩效总表
      </Link>
      <span style={{ display: 'block', marginTop: '0.35rem', opacity: 0.85 }}>
        查看当前账号可见范围内各团队的关联站点与文章汇总（与单条编辑页口径一致）。
      </span>
    </div>
  )
}
