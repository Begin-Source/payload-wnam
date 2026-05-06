'use client'

import type { CSSProperties, ReactElement } from 'react'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import type { TeamAdminStatsJson } from '@/utilities/teamStatsScope'

function teamIdFromAdminPath(pathname: string | null): number | null {
  if (!pathname) return null
  const m = pathname.match(/\/admin\/collections\/teams\/(\d+)(?:\/|$|\?)/)
  if (!m?.[1]) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/**
 * Teams edit view: performance rollup for **this** document (`teamStatsScope.ts`).
 * Placed under Slug via `type: 'ui'` so it aligns with the main column field flow.
 */
export function TeamStatsField(): ReactElement {
  const pathname = usePathname()
  const teamId = useMemo(() => teamIdFromAdminPath(pathname), [pathname])

  const [data, setData] = useState<TeamAdminStatsJson | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (teamId == null) {
      setData(null)
      setErr(null)
      setLoading(false)
      return
    }
    const ac = new AbortController()
    setLoading(true)
    setErr(null)
    void (async () => {
      try {
        const res = await fetch(`/api/admin/teams/${teamId}/stats`, {
          credentials: 'include',
          signal: ac.signal,
          headers: { Accept: 'application/json' },
        })
        const json = (await res.json()) as TeamAdminStatsJson
        if (!res.ok) {
          if (!ac.signal.aborted) {
            setErr(!json.ok ? json.error : res.statusText)
            setData(null)
          }
          return
        }
        if (!ac.signal.aborted) {
          setData(json)
          setErr(null)
        }
      } catch (e: unknown) {
        if (ac.signal.aborted) return
        setErr(e instanceof Error ? e.message : '加载失败')
        setData(null)
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()

    return () => ac.abort()
  }, [teamId])

  const panelStyle: CSSProperties = {
    marginTop: '0.25rem',
    marginBottom: 'var(--base)',
    padding: 'var(--base)',
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: 4,
    background: 'var(--theme-elevation-50)',
    maxWidth: '100%',
  }

  return (
    <div className="team-stats-field" style={panelStyle}>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>团队绩效（本记录口径）</div>
      {teamId == null ? (
        <p style={{ margin: 0, opacity: 0.85 }}>新建团队请先保存文档，保存后即可在此查看统计。</p>
      ) : null}
      {teamId != null && loading ? <p style={{ margin: 0, opacity: 0.85 }}>加载中…</p> : null}
      {teamId != null && err ? (
        <p style={{ margin: 0, color: 'var(--theme-error-500)' }}>{err}</p>
      ) : null}
      {teamId != null && data?.ok ? (
        <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
          <li>编制人数（组长 + 成员，去重）：{data.rosterCount}</li>
          <li>关联站点数：{data.sitesTotal}</li>
          <li>文章总数：{data.articlesTotal}</li>
          <li>已发布：{data.articlesPublished}</li>
          <li>草稿：{data.articlesDraft}</li>
          <li>近 30 天发布：{data.articlesPublishedLast30d}</li>
          {data.message ? (
            <li style={{ color: 'var(--theme-warning-600)' }}>{data.message}</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
