'use client'

import { Gutter } from '@payloadcms/ui'
import Link from 'next/link'
import React, { useCallback, useEffect, useState } from 'react'

/** Local types only — do not import `@/utilities/teamStatsScope` in client views (pulls server graph). */
type TeamStatsMetrics = {
  rosterCount: number
  leadAssigned: boolean
  message?: string
  sitesTotal: number
  articlesTotal: number
  articlesPublished: number
  articlesDraft: number
  articlesPublishedLast30d: number
}

type TeamStatsSummaryRow = {
  id: number
  name: string
  tenantId: number | null
  stats: TeamStatsMetrics
}

type TeamStatsSummaryJson =
  | {
      ok: true
      rows: TeamStatsSummaryRow[]
      totalDocs: number
      page: number
      totalPages: number
      hasNextPage: boolean
      hasPrevPage: boolean
      limit: number
    }
  | { ok: false; error: string }

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.4rem 0.5rem',
  borderBottom: '1px solid var(--theme-elevation-150)',
  whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = {
  padding: '0.35rem 0.5rem',
  borderBottom: '1px solid var(--theme-elevation-100)',
  verticalAlign: 'top',
}

const cardStyle: React.CSSProperties = {
  padding: '1rem',
  borderRadius: 8,
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-50)',
  marginBottom: '1rem',
}

export function TeamPerformanceView(_props: Record<string, unknown>): React.ReactElement {
  void _props
  const [tenantId, setTenantId] = useState('')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [summary, setSummary] = useState<{
    rows: TeamStatsSummaryRow[]
    totalDocs: number
    page: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
    limit: number
  } | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    setBusy(true)
    try {
      const qs = new URLSearchParams()
      qs.set('page', String(page))
      qs.set('limit', '50')
      if (tenantId.trim()) qs.set('tenantId', tenantId.trim())
      const r = await fetch(`/api/admin/teams/stats-summary?${qs.toString()}`, {
        credentials: 'include',
      })
      const j = (await r.json().catch(() => ({}))) as TeamStatsSummaryJson
      if (!r.ok || !j.ok) {
        setLoadError(!j.ok ? j.error : r.statusText)
        setSummary(null)
        return
      }
      setSummary({
        rows: j.rows,
        totalDocs: j.totalDocs,
        page: j.page,
        totalPages: j.totalPages,
        hasNextPage: j.hasNextPage,
        hasPrevPage: j.hasPrevPage,
        limit: j.limit,
      })
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
      setSummary(null)
    } finally {
      setBusy(false)
    }
  }, [page, tenantId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Gutter>
      <h1 style={{ fontSize: '1.35rem', marginBottom: '0.75rem' }}>团队绩效</h1>
      <p style={{ opacity: 0.82, marginBottom: '1rem', maxWidth: '46rem', lineHeight: 1.55 }}>
        口径与单条「成员管理」编辑页一致：本记录的组长 + 成员 → 关联站点 → 文章汇总。可按租户 ID
        筛选；留空则列出当前账号有权访问的全部记录（与列表权限一致）。
      </p>

      <div style={cardStyle}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <label>
            <span style={{ display: 'block', fontSize: '0.75rem', marginBottom: 4 }}>租户 ID（可选）</span>
            <input
              value={tenantId}
              onChange={(e) => {
                setTenantId(e.target.value)
                setPage(1)
              }}
              style={{
                padding: '0.45rem 0.55rem',
                borderRadius: 4,
                border: '1px solid var(--theme-elevation-150)',
                width: 120,
              }}
            />
          </label>
          <button type="button" disabled={busy} onClick={() => void load()}>
            刷新
          </button>
          <Link href="/admin/collections/teams" prefetch={false} style={{ fontSize: '0.875rem' }}>
            成员管理列表
          </Link>
        </div>
        {loadError ? (
          <div style={{ color: 'var(--theme-error-500)', marginTop: '0.75rem', fontSize: '0.875rem' }}>
            {loadError}
          </div>
        ) : null}
      </div>

      <div style={cardStyle}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr>
                <th style={thStyle}>团队名称</th>
                <th style={thStyle}>租户</th>
                <th style={thStyle}>编制</th>
                <th style={thStyle}>站点</th>
                <th style={thStyle}>文章</th>
                <th style={thStyle}>已发布</th>
                <th style={thStyle}>草稿</th>
                <th style={thStyle}>近30天发布</th>
                <th style={thStyle}>说明</th>
              </tr>
            </thead>
            <tbody>
              {summary?.rows?.length
                ? summary.rows.map((row) => (
                    <tr key={row.id}>
                      <td style={tdStyle}>
                        <a href={`/admin/collections/teams/${row.id}`}>{row.name || `— #${row.id}`}</a>
                      </td>
                      <td style={tdStyle}>{row.tenantId ?? '—'}</td>
                      <td style={tdStyle}>{row.stats.rosterCount}</td>
                      <td style={tdStyle}>{row.stats.sitesTotal}</td>
                      <td style={tdStyle}>{row.stats.articlesTotal}</td>
                      <td style={tdStyle}>{row.stats.articlesPublished}</td>
                      <td style={tdStyle}>{row.stats.articlesDraft}</td>
                      <td style={tdStyle}>{row.stats.articlesPublishedLast30d}</td>
                      <td style={{ ...tdStyle, maxWidth: 220, fontSize: '0.75rem', opacity: 0.9 }}>
                        {row.stats.message ?? (row.stats.leadAssigned ? '' : '未设组长')}
                      </td>
                    </tr>
                  ))
                : null}
              {!busy && summary?.rows?.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={9}>
                    暂无数据
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {summary ? (
          <div style={{ marginTop: '0.75rem', fontSize: '0.8125rem', opacity: 0.85 }}>
            共 {summary.totalDocs} 条 · 第 {summary.page} / {summary.totalPages} 页
            <span style={{ marginLeft: '0.75rem' }}>
              <button
                type="button"
                disabled={busy || !summary.hasPrevPage}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </button>
              <button
                type="button"
                disabled={busy || !summary.hasNextPage}
                style={{ marginLeft: 8 }}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </button>
            </span>
          </div>
        ) : null}
      </div>
    </Gutter>
  )
}
