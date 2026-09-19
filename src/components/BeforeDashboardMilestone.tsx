'use client'

import React, { useEffect, useState } from 'react'

import { AgentWorkbench } from '@/components/AgentWorkbench'
import { ContentCalendarBoard } from '@/components/ContentCalendarBoard'
import { ContentLifecycleBoard } from '@/components/ContentLifecycleBoard'

type DashboardStats = {
  view: 'executive' | 'operations' | 'finance' | 'system' | 'public'
  heading: string
  description: string
  metrics: Array<{ key: string; label: string; value: number }>
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
 * Admin 首页按当前角色返回独立投影，避免财务、系统管理员或普通用户收到无关字段。
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
        <strong>{data?.heading ?? '工作台'}</strong>
        <p style={{ margin: '0.35rem 0 0', opacity: 0.85, fontSize: '0.9rem' }}>
          {data?.description ?? '正在读取当前账号的工作范围…'}
        </p>
      </div>

      {loading && <p style={{ margin: 0, opacity: 0.8 }}>加载统计数据…</p>}
      {error && (
        <p style={{ margin: 0, color: 'var(--theme-error-500, #c00)' }} role="alert">
          {error}
        </p>
      )}
      {!loading && !error && data && (
        <>
          {data.metrics.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(9.5rem, 1fr))',
                gap: '0.75rem',
              }}
            >
              {data.metrics.map((metric) => (
                <StatCard key={metric.key} label={metric.label} value={metric.value} />
              ))}
            </div>
          )}
          {data.view !== 'public' && <AgentWorkbench />}
          {(data.view === 'executive' || data.view === 'operations') && (
            <>
              <ContentLifecycleBoard />
              <ContentCalendarBoard />
            </>
          )}
        </>
      )}
    </div>
  )
}
