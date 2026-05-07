'use client'

import { Gutter } from '@payloadcms/ui'
import React, { useState } from 'react'

import { PipelineProfilesKpiCompareSection } from '@/components/PipelineProfilesKpiCompareSection'

const cardStyle: React.CSSProperties = {
  padding: '1rem',
  borderRadius: 8,
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-50)',
  marginBottom: '1rem',
}

export function PipelineProfilesCompareView(_props: Record<string, unknown>): React.ReactElement {
  void _props
  const [bulkProfileId, setBulkProfileId] = useState('')
  const [bulkSites, setBulkSites] = useState('')
  const [bulkArticles, setBulkArticles] = useState('')
  const [bulkMsg, setBulkMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  return (
    <Gutter>
      <h1 style={{ fontSize: '1.35rem', marginBottom: '0.75rem' }}>SEO 流水线方案 · KPI</h1>
      <p style={{ opacity: 0.82, marginBottom: '1rem', maxWidth: '42rem', lineHeight: 1.55 }}>
        工单聚合依赖 <code>input.pipelineProfileSlug</code> 或 <code>pipelineProfileId</code>；
        文章列来自 <code>articles.pipelineProfileSlug</code>。全租户管理员请先填 tenantId 再刷新列表。
      </p>

      <PipelineProfilesKpiCompareSection />

      <div style={cardStyle}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.35rem' }}>批量挂载流水线方案</h2>
        <p style={{ opacity: 0.8, fontSize: '0.8125rem', marginBottom: '0.75rem', lineHeight: 1.5 }}>
          <code>pipelineProfileId</code>（方案 ID）+ 英文逗号分隔的站点 ID / 文章 ID。站点与文章的租户必须与该方案一致。
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
