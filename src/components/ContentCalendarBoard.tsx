'use client'

import { Button } from '@payloadcms/ui'
import React, { useEffect, useMemo, useState } from 'react'

type Row = {
  id: string | number
  term?: string | null
  opportunityScore?: number | null
  site?: unknown
}

type CalendarPayload = {
  calendar: {
    dailyPostCapSample: { siteId: unknown; dailyPostCap: number }[]
    rows: Row[]
  }
}

function defaultDailyCap(sample: CalendarPayload['calendar']['dailyPostCapSample']): number {
  const n = sample[0]?.dailyPostCap
  return typeof n === 'number' && n > 0 ? n : 3
}

function withSchedule(rows: Row[], dailyCap: number) {
  const cap = Math.max(dailyCap, 1)
  return rows.map((r, i) => ({
    ...r,
    week: Math.floor(i / cap) + 1,
    dayIndex: (i % cap) + 1,
  }))
}

/**
 * 关键词机会 × 每日产能 cap 的简易排期视图（钉子 4）。
 */
export function ContentCalendarBoard(): React.ReactElement {
  const [data, setData] = useState<CalendarPayload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [scheduling, setScheduling] = useState<string | number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let c = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/seo-dashboard', { credentials: 'include' })
        if (!res.ok) {
          if (!c) setErr(res.status === 401 ? '请先登录' : `加载失败 (${res.status})`)
          return
        }
        const j = (await res.json()) as CalendarPayload
        if (!c) setData(j)
      } catch {
        if (!c) setErr('网络错误')
      }
    })()
    return () => {
      c = true
    }
  }, [])

  const rows = useMemo(() => {
    if (!data?.calendar?.rows) return []
    const cap = defaultDailyCap(data.calendar.dailyPostCapSample)
    return withSchedule(data.calendar.rows.slice(0, 42), cap)
  }, [data])

  const scheduleBrief = async (keywordId: string | number): Promise<void> => {
    setMsg(null)
    setScheduling(keywordId)
    try {
      const res = await fetch('/api/admin/calendar-schedule-brief', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywordId: typeof keywordId === 'string' ? Number(keywordId) : keywordId,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; id?: number }
      if (!res.ok) {
        setMsg(typeof j.error === 'string' ? j.error : `排产失败 (${res.status})`)
        return
      }
      setMsg(`已入队 brief_generate #${j.id ?? ''}`)
    } catch {
      setMsg('网络错误')
    } finally {
      setScheduling(null)
    }
  }

  return (
    <div
      style={{
        marginTop: '1rem',
        padding: '0.75rem 1rem',
        borderRadius: 6,
        border: '1px solid var(--theme-elevation-150)',
        background: 'var(--theme-elevation-50)',
      }}
    >
      <strong>内容日历（机会分 × 日 cap）</strong>
      <p style={{ margin: '0.35rem 0 0', opacity: 0.85, fontSize: '0.88rem' }}>
        按 <code>opportunityScore</code> 降序与 <code>SiteQuotas.dailyPostCap</code> 生成虚拟周序；每行「排产」创建一条{' '}
        <code>brief_generate</code> 工作流任务（与批量排产一致，需 tick 执行）。
      </p>
      {msg && (
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: 'var(--theme-success-600, #15803d)' }}>{msg}</p>
      )}
      {err && (
        <p style={{ color: 'var(--theme-error-500, #c00)' }} role="alert">
          {err}
        </p>
      )}
      {!err && !data && <p style={{ opacity: 0.8 }}>加载中…</p>}
      {rows.length > 0 && (
        <div style={{ marginTop: '0.6rem', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.35rem' }}>周</th>
                <th style={{ textAlign: 'left', padding: '0.35rem' }}>槽</th>
                <th style={{ textAlign: 'left', padding: '0.35rem' }}>词</th>
                <th style={{ textAlign: 'right', padding: '0.35rem' }}>机会分</th>
                <th style={{ textAlign: 'left', padding: '0.35rem' }}>排产</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${String(r.id)}-${r.week}-${r.dayIndex}`}>
                  <td style={{ padding: '0.35rem' }}>{r.week}</td>
                  <td style={{ padding: '0.35rem' }}>{r.dayIndex}</td>
                  <td style={{ padding: '0.35rem' }}>{r.term}</td>
                  <td style={{ padding: '0.35rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.opportunityScore ?? '—'}
                  </td>
                  <td style={{ padding: '0.35rem' }}>
                    <Button
                      buttonStyle="secondary"
                      disabled={scheduling === r.id}
                      size="small"
                      type="button"
                      onClick={() => void scheduleBrief(r.id)}
                    >
                      {scheduling === r.id ? '…' : '排产'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
