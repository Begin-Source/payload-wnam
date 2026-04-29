'use client'

import React, { useEffect, useState } from 'react'

import { ContentCalendarBoard } from '@/components/ContentCalendarBoard'
import { ContentLifecycleBoard } from '@/components/ContentLifecycleBoard'

type DashboardStats = {
  sites: number
  sitesActive: number
  clickEvents: number
  clicksOnly: number
  articlesPublished: number
  pagesPublished: number
  workflowActive: number
  keywords: number
  commissions: number
  rankings: number
}

const cardStyle: React.CSSProperties = {
  padding: '0.875rem 1rem',
  borderRadius: 6,
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-50)',
  minWidth: 0,
}

function StatCard({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: '0.75rem', opacity: 0.75, marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ fontSize: '1.35rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {value.toLocaleString()}
      </div>
    </div>
  )
}

/**
 * Admin 首页运营看板：站点、点击、内容与工作流等汇总（数据来自 `/api/admin/dashboard-stats`）。
 */
export function BeforeDashboardMilestone(): React.ReactElement {
  const [data, setData] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/dashboard-stats', { credentials: 'include' })
        if (!res.ok) {
          if (!cancelled) setError(res.status === 401 ? '请先登录' : `加载失败 (${res.status})`)
          return
        }
        const json = (await res.json()) as DashboardStats
        if (!cancelled) setData(json)
      } catch {
        if (!cancelled) setError('网络错误')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div
      style={{
        marginBottom: '1.5rem',
        padding: '1rem 1.25rem',
        borderRadius: 6,
        border: '1px solid var(--theme-elevation-150)',
        background: 'var(--theme-elevation-50)',
      }}
    >
      <div style={{ marginBottom: '0.75rem' }}>
        <strong>运营看板</strong>
        <p style={{ margin: '0.35rem 0 0', opacity: 0.85, fontSize: '0.9rem' }}>
          以下为当前账号可访问租户范围内的汇总；通知公告请在侧栏「首页」→「通知公告」中维护。
        </p>
      </div>

      {loading && <p style={{ margin: 0, opacity: 0.8 }}>加载统计数据…</p>}
      {error && (
        <p style={{ margin: 0, color: 'var(--theme-error-500, #c00)' }} role="alert">
          {error}
        </p>
      )}
      {!loading && !error && data && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(9.5rem, 1fr))',
            gap: '0.75rem',
          }}
        >
          <StatCard label="站点总数" value={data.sites} />
          <StatCard label="运行中站点" value={data.sitesActive} />
          <StatCard label="点击事件" value={data.clickEvents} />
          <StatCard label="其中点击" value={data.clicksOnly} />
          <StatCard label="已发布文章" value={data.articlesPublished} />
          <StatCard label="已发布页面" value={data.pagesPublished} />
          <StatCard label="工作流进行中" value={data.workflowActive} />
          <StatCard label="关键词" value={data.keywords} />
          <StatCard label="佣金记录" value={data.commissions} />
          <StatCard label="排名快照" value={data.rankings} />
        </div>
      )}
      <ContentLifecycleBoard />
      <ContentCalendarBoard />
    </div>
  )
}
