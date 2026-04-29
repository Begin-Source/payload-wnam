'use client'

import React, { useEffect, useState } from 'react'

type SeoDashboard = {
  lifecycle: Record<string, number>
  linkGraph: { totalEdges: number }
  roi: { note?: string; spendUsdPlaceholder?: number; clicks30dPlaceholder?: number }
}

const card: React.CSSProperties = {
  padding: '0.75rem 1rem',
  borderRadius: 6,
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-50)',
  marginTop: '1rem',
}

/**
 * 生命周期 + 内链健康 + ROI 占位（数据 `/api/admin/seo-dashboard`）。
 */
export function ContentLifecycleBoard(): React.ReactElement {
  const [data, setData] = useState<SeoDashboard | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let c = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/seo-dashboard', { credentials: 'include' })
        if (!res.ok) {
          if (!c) setErr(res.status === 401 ? '请先登录' : `加载失败 (${res.status})`)
          return
        }
        const j = (await res.json()) as SeoDashboard
        if (!c) setData(j)
      } catch {
        if (!c) setErr('网络错误')
      }
    })()
    return () => {
      c = true
    }
  }, [])

  return (
    <div style={card}>
      <strong>SEO 生命周期与内链</strong>
      <p style={{ margin: '0.35rem 0 0', opacity: 0.85, fontSize: '0.88rem' }}>
        每日 <code>triage</code> 与 <code>internal-link-audit</code> 写入队列与知识库；以下为租户范围内快照。
      </p>
      {err && (
        <p style={{ color: 'var(--theme-error-500, #c00)', marginBottom: 0 }} role="alert">
          {err}
        </p>
      )}
      {!err && !data && <p style={{ opacity: 0.8 }}>加载中…</p>}
      {data && (
        <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.75rem' }}>
          <div>
            <div style={{ fontSize: '0.8rem', opacity: 0.75, marginBottom: '0.25rem' }}>已发布文章 · 生命周期分布</div>
            <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.88rem' }}>
              {Object.entries(data.lifecycle)
                .filter(([, n]) => n > 0)
                .map(([k, n]) => (
                  <li key={k}>
                    <code>{k}</code>：{n}
                  </li>
                ))}
            </ul>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', opacity: 0.75, marginBottom: '0.25rem' }}>内链健康（PageLinkGraph）</div>
            <div style={{ fontVariantNumeric: 'tabular-nums' }}>边总数：{data.linkGraph.totalEdges}</div>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', opacity: 0.85 }}>
              孤儿页与锚分布详见月度 <code>internal-link-audit</code> 写入的 audit 知识库条目。
            </p>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', opacity: 0.75, marginBottom: '0.25rem' }}>ROI 占位</div>
            <p style={{ margin: 0, fontSize: '0.86rem', opacity: 0.9 }}>{data.roi.note}</p>
          </div>
        </div>
      )}
    </div>
  )
}
