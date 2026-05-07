'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'

export type ProfileRow = {
  id: number
  name: string
  slug: string
  tenantId: number | null
  isDefault: boolean
}

export type CompareRow = {
  profileId: number
  name: string
  slug: string
  report: {
    workflow: {
      matchedJobs: number
      failedRate: number
      avgDurationMs: number | null
      sumPromptTokens: number
    }
    articles: {
      matchedBySnapshotSlug: number
      avgQualityScore: number | null
      avgCurrentPosition: number | null
    }
  }
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.4rem 0.5rem',
  borderBottom: '1px solid var(--theme-elevation-150)',
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

export type PipelineProfilesKpiCompareSectionProps = {
  /** When both change handlers are set, tenant/days are controlled (e.g. StrategyPanelView). */
  tenantId?: string
  onTenantIdChange?: (v: string) => void
  days?: number
  onDaysChange?: (v: number) => void
}

/**
 * Tenant filter, profile multi-select, POST compare, and KPI table — shared by
 * PipelineProfilesCompareView and StrategyPanelView.
 */
export function PipelineProfilesKpiCompareSection(
  props: PipelineProfilesKpiCompareSectionProps = {},
): React.ReactElement {
  const [internalTenantId, setInternalTenantId] = useState('')
  const [internalDays, setInternalDays] = useState(30)
  const controlled =
    props.onTenantIdChange !== undefined &&
    props.onDaysChange !== undefined &&
    props.tenantId !== undefined &&
    props.days !== undefined
  const tenantId = controlled ? props.tenantId! : internalTenantId
  const setTenantId = controlled ? props.onTenantIdChange! : setInternalTenantId
  const days = controlled ? props.days! : internalDays
  const setDays = controlled ? props.onDaysChange! : setInternalDays

  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [compareRows, setCompareRows] = useState<CompareRow[] | null>(null)
  const [busy, setBusy] = useState(false)

  const loadProfiles = useCallback(async () => {
    setLoadError(null)
    setBusy(true)
    try {
      const qs = tenantId.trim() ? `?tenantId=${encodeURIComponent(tenantId.trim())}` : ''
      const r = await fetch(`/api/admin/pipeline-profiles/list${qs}`, { credentials: 'include' })
      const j = (await r.json().catch(() => ({}))) as { profiles?: ProfileRow[]; error?: string }
      if (!r.ok) {
        setLoadError(j.error || r.statusText)
        setProfiles([])
        return
      }
      setProfiles(Array.isArray(j.profiles) ? j.profiles : [])
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [tenantId])

  useEffect(() => {
    void loadProfiles()
  }, [loadProfiles])

  const toggle = (id: number) => {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const runCompare = async () => {
    setBusy(true)
    setCompareRows(null)
    try {
      const r = await fetch('/api/admin/pipeline-profiles/compare', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileIds: [...selected], days }),
      })
      const j = (await r.json().catch(() => ({}))) as { rows?: CompareRow[]; error?: string }
      if (!r.ok) {
        setLoadError(j.error || r.statusText)
        return
      }
      setCompareRows(Array.isArray(j.rows) ? j.rows : [])
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const tableMemo = useMemo(() => {
    if (!compareRows?.length) return null
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>方案</th>
              <th style={thStyle}>Slug</th>
              <th style={thStyle}>匹配工单</th>
              <th style={thStyle}>失败率</th>
              <th style={thStyle}>均耗时(ms)</th>
              <th style={thStyle}>Prompt tokens</th>
              <th style={thStyle}>快照文章</th>
              <th style={thStyle}>均分质量</th>
              <th style={thStyle}>均排名</th>
            </tr>
          </thead>
          <tbody>
            {compareRows.map((row) => (
              <tr key={row.profileId}>
                <td style={tdStyle}>{row.name}</td>
                <td style={tdStyle}>
                  <code>{row.slug}</code>
                </td>
                <td style={tdStyle}>{row.report.workflow.matchedJobs}</td>
                <td style={tdStyle}>{(row.report.workflow.failedRate * 100).toFixed(1)}</td>
                <td style={tdStyle}>{row.report.workflow.avgDurationMs ?? '—'}</td>
                <td style={tdStyle}>{row.report.workflow.sumPromptTokens}</td>
                <td style={tdStyle}>{row.report.articles.matchedBySnapshotSlug}</td>
                <td style={tdStyle}>{row.report.articles.avgQualityScore ?? '—'}</td>
                <td style={tdStyle}>{row.report.articles.avgCurrentPosition ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }, [compareRows])

  return (
    <>
      <div style={cardStyle}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          {controlled ? (
            <p style={{ margin: '0 0.5rem 0 0', fontSize: '0.8125rem', opacity: 0.85 }}>
              使用上方「租户与区间」中的租户 ID 与天数。
            </p>
          ) : (
            <>
              <label>
                <span style={{ display: 'block', fontSize: '0.75rem', marginBottom: 4 }}>租户 ID</span>
                <input
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  style={{
                    padding: '0.45rem 0.55rem',
                    borderRadius: 4,
                    border: '1px solid var(--theme-elevation-150)',
                    width: 120,
                  }}
                />
              </label>
              <label>
                <span style={{ display: 'block', fontSize: '0.75rem', marginBottom: 4 }}>天数</span>
                <input
                  type="number"
                  min={1}
                  max={730}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value) || 30)}
                  style={{
                    padding: '0.45rem 0.55rem',
                    borderRadius: 4,
                    border: '1px solid var(--theme-elevation-150)',
                    width: 96,
                  }}
                />
              </label>
            </>
          )}
          <button type="button" disabled={busy} onClick={() => void loadProfiles()}>
            刷新列表
          </button>
          <button type="button" disabled={busy || selected.size === 0} onClick={() => void runCompare()}>
            对比所选
          </button>
        </div>
        {loadError ? (
          <div style={{ color: '#c62828', marginTop: '0.75rem', fontSize: '0.875rem' }}>{loadError}</div>
        ) : null}
      </div>

      <div style={cardStyle}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>方案列表</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 280, overflowY: 'auto' }}>
          {profiles.map((p) => (
            <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.25rem 0' }}>
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
              <span>
                {p.name}{' '}
                <small style={{ opacity: 0.75 }}>({p.slug})</small>
              </span>
              <a href={`/admin/collections/pipeline-profiles/${p.id}`} style={{ fontSize: '0.75rem' }}>
                edit
              </a>
              <button
                type="button"
                style={{ fontSize: '0.75rem', marginLeft: 8 }}
                onClick={() =>
                  void (async () => {
                    try {
                      const r = await fetch(`/api/admin/pipeline-profiles/${p.id}/report?days=${days}`, {
                        credentials: 'include',
                      })
                      const j = await r.json().catch(() => ({}))
                      if (r.ok && j.report) console.info('[report]', j.report)
                      alert(r.ok ? '已在浏览器控制台输出 report 对象' : String(j.error || r.statusText))
                    } catch {
                      alert('请求失败')
                    }
                  })()
                }
              >
                单行报表
              </button>
              <button
                type="button"
                style={{ fontSize: '0.75rem' }}
                onClick={() =>
                  void (async () => {
                    try {
                      const r = await fetch(`/api/admin/pipeline-profiles/${p.id}/clone`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({}),
                      })
                      const j = await r.json().catch(() => ({}))
                      alert(
                        r.ok
                          ? `克隆完成 id=${j.id} slug=${j.slug}`
                          : `失败：${String(j.error || r.status)}`,
                      )
                      void loadProfiles()
                    } catch (e) {
                      alert(`失败 ${e instanceof Error ? e.message : String(e)}`)
                    }
                  })()
                }
              >
                克隆
              </button>
            </li>
          ))}
        </ul>
      </div>

      {compareRows ? (
        <div style={cardStyle}>
          <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>最近 {days} 天 · 横向对比</h2>
          {tableMemo}
        </div>
      ) : null}
    </>
  )
}
