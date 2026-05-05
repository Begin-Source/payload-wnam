'use client'

import { Gutter } from '@payloadcms/ui'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

type ProfileRow = {
  id: number
  name: string
  slug: string
  tenantId: number | null
  isDefault: boolean
}

type CompareRow = {
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

export function PipelineProfilesCompareView(_props: Record<string, unknown>): React.ReactElement {
  void _props
  const [tenantId, setTenantId] = useState('')
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [days, setDays] = useState(30)
  const [compareRows, setCompareRows] = useState<CompareRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [bulkProfileId, setBulkProfileId] = useState('')
  const [bulkSites, setBulkSites] = useState('')
  const [bulkArticles, setBulkArticles] = useState('')
  const [bulkMsg, setBulkMsg] = useState<string | null>(null)

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

  const runBulk = async (clear: boolean) => {
    setBulkMsg(null)
    const siteIds = bulkSites
      .split(/[\s,]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n))
    const articleIds = bulkArticles
      .split(/[\s,]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n))
    const pid = Number(bulkProfileId.trim())
    setBusy(true)
    try {
      const r = await fetch('/api/admin/pipeline-profiles/bulk-assign', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clear,
          pipelineProfileId: clear ? undefined : pid,
          siteIds,
          articleIds,
        }),
      })
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
      if (!r.ok) {
        setBulkMsg(String(j.error || r.statusText))
        return
      }
      setBulkMsg(
        `sites ${Number(j.sitesUpdated)} · articles ${Number(j.articlesUpdated)}` +
          (Array.isArray(j.errors) && j.errors.length ? ` · errors: ${String(j.errors)}` : ''),
      )
    } catch (e) {
      setBulkMsg(e instanceof Error ? e.message : String(e))
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
              <th style={thStyle}>配置</th>
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
    <Gutter>
      <h1 style={{ fontSize: '1.35rem', marginBottom: '0.75rem' }}>流水线 Profile · KPI</h1>
      <p style={{ opacity: 0.82, marginBottom: '1rem', maxWidth: '42rem', lineHeight: 1.55 }}>
        工单聚合依赖 <code>input.pipelineProfileSlug</code> 或 <code>pipelineProfileId</code>；
        文章列来自 <code>articles.pipelineProfileSlug</code>。全租户管理员请先填 tenantId 再刷新列表。
      </p>

      <div style={cardStyle}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
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
          <button type="button" disabled={busy} onClick={() => void loadProfiles()}>
            刷新列表
          </button>
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
          <button type="button" disabled={busy || selected.size === 0} onClick={() => void runCompare()}>
            对比所选
          </button>
        </div>
        {loadError ? (
          <div style={{ color: '#c62828', marginTop: '0.75rem', fontSize: '0.875rem' }}>{loadError}</div>
        ) : null}
      </div>

      <div style={cardStyle}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>配置列表</h2>
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

      <div style={cardStyle}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.35rem' }}>批量挂载流水线</h2>
        <p style={{ opacity: 0.8, fontSize: '0.8125rem', marginBottom: '0.75rem', lineHeight: 1.5 }}>
          <code>pipelineProfileId</code> + 英文逗号分隔的站点 ID / 文章 ID。站点与文章的租户必须与该 Profile 一致。
          「清空」将把所列站点与文章的 <code>pipelineProfile</code> 置空。
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            value={bulkProfileId}
            onChange={(e) => setBulkProfileId(e.target.value)}
            placeholder="pipelineProfileId"
            style={{ maxWidth: 200, padding: '0.4rem', borderRadius: 4 }}
          />
          <textarea
            value={bulkSites}
            onChange={(e) => setBulkSites(e.target.value)}
            placeholder="site IDs"
            rows={2}
            style={{ padding: '0.4rem', borderRadius: 4 }}
          />
          <textarea
            value={bulkArticles}
            onChange={(e) => setBulkArticles(e.target.value)}
            placeholder="article IDs"
            rows={2}
            style={{ padding: '0.4rem', borderRadius: 4 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={busy} onClick={() => void runBulk(false)}>
              分配挂载
            </button>
            <button type="button" disabled={busy} onClick={() => void runBulk(true)}>
              清空挂载
            </button>
          </div>
          {bulkMsg ? <div style={{ fontSize: '0.8125rem' }}>{bulkMsg}</div> : null}
        </div>
      </div>
    </Gutter>
  )
}
