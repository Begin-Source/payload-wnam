'use client'

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
 * Uses a plain anchor (not `next/link`) to avoid webpack chunk issues inside Payload Admin.
 */
export function TeamPerformanceListLink(): React.ReactElement {
  return (
    <div style={wrap}>
      <a href="/admin/teams/performance" style={{ fontWeight: 600 }}>
        打开团队绩效总表
      </a>
      <span style={{ display: 'block', marginTop: '0.35rem', opacity: 0.85 }}>
        查看当前账号可见范围内各团队的关联站点与文章汇总（与单条编辑页口径一致）。
      </span>
    </div>
  )
}
