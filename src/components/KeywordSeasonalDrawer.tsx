'use client'

import { useAdminBackgroundActivity } from '@/components/adminBackgroundActivity/AdminBackgroundActivityProvider'
import type { BatchEnqueueOkJson } from '@/utilities/keywordBatchEnqueuePreview'
import { Button } from '@payloadcms/ui'
import React, { useCallback, useEffect, useRef, useState } from 'react'

type SiteOption = { id: number; name: string; slug: string; primaryDomain: string }

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
  background: 'rgba(0, 0, 0, 0.45)',
}

const panelStyle: React.CSSProperties = {
  width: 'min(52rem, 100%)',
  maxHeight: '90vh',
  overflow: 'auto',
  borderRadius: 8,
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-0)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  padding: '1.25rem 1.5rem',
}

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 600,
  marginBottom: '0.35rem',
  opacity: 0.85,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.65rem',
  borderRadius: 4,
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-50)',
  color: 'inherit',
  fontSize: '0.875rem',
}

function formatSiteLine(s: SiteOption): string {
  return `${s.name} (${s.slug}) ${s.primaryDomain}`
}

function parseLimitOverride(batchLimitInput: string): number | undefined {
  const lim = batchLimitInput.trim()
  if (lim === '') return undefined
  const n = Number(lim)
  if (!Number.isFinite(n) || n < 1) return undefined
  return Math.min(100, Math.floor(n))
}

function clampSeasonalMin(raw: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0.7
  return Math.min(0.95, Math.max(0.35, n))
}

/** 季节 / trend 峰值向 brief_generate */
export function KeywordSeasonalDrawer(): React.ReactElement {
  const {
    startBatchEnqueueJob,
    completeBatchEnqueueJob,
    failBatchEnqueueJob,
    startKeywordBatchModePreviewJob,
    completeKeywordBatchModePreviewJob,
    failKeywordBatchModePreviewJob,
  } = useAdminBackgroundActivity()

  const [open, setOpen] = useState(false)
  const [siteQuery, setSiteQuery] = useState('')
  const [sites, setSites] = useState<SiteOption[]>([])
  const [sitesLoading, setSitesLoading] = useState(false)
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null)
  const [selectedSiteLabel, setSelectedSiteLabel] = useState('')
  const [siteMenuOpen, setSiteMenuOpen] = useState(false)
  const siteComboboxRef = useRef<HTMLDivElement>(null)

  const [minSeasonalScore, setMinSeasonalScore] = useState('0.7')
  const [batchLimitInput, setBatchLimitInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{
    pickedTerms: string[]
    pickedSeasonalMeta: Array<{ term: string; seasonalScore: number }>
    wouldEnqueue: number
  } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const loadSites = useCallback(async (q: string) => {
    setSitesLoading(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/admin/article-quick-action/options?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error('加载站点失败')
      const data = (await res.json()) as { sites: SiteOption[] }
      setSites(data.sites ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载站点失败')
      setSites([])
    } finally {
      setSitesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open || !siteMenuOpen) return
    const t = window.setTimeout(() => void loadSites(siteQuery), 300)
    return () => window.clearTimeout(t)
  }, [open, siteMenuOpen, siteQuery, loadSites])

  useEffect(() => {
    if (!open || selectedSiteId == null) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/admin/keyword-batch-presets/for-site?siteId=${selectedSiteId}`, {
          credentials: 'include',
        })
        if (!res.ok || cancelled) return
        const data = (await res.json()) as {
          preset?: {
            batchMode?: string
            defaultBatchLimit?: number | null
            minSeasonalScore?: number | null
          } | null
        }
        if (cancelled) return
        const p = data.preset
        if (p?.batchMode === 'seasonal' && typeof p.minSeasonalScore === 'number' && Number.isFinite(p.minSeasonalScore)) {
          setMinSeasonalScore(String(p.minSeasonalScore))
        }
        if (p?.defaultBatchLimit != null && typeof p.defaultBatchLimit === 'number' && p.defaultBatchLimit >= 1) {
          setBatchLimitInput(String(Math.min(100, Math.floor(p.defaultBatchLimit))))
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, selectedSiteId])

  const fetchPreview = useCallback(async () => {
    if (selectedSiteId == null) return
    const minS = clampSeasonalMin(minSeasonalScore)
    setPreviewLoading(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        siteId: selectedSiteId,
        mode: 'seasonal',
        dryRun: true,
        minSeasonalScore: minS,
      }
      const lim = parseLimitOverride(batchLimitInput)
      if (lim != null) body.limit = lim
      const res = await fetch('/api/admin/articles/batch-enqueue', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as BatchEnqueueOkJson
      if (!res.ok || data.ok !== true) {
        setPreview(null)
        setError(typeof data.error === 'string' ? data.error : '预览失败')
        return
      }
      setPreview({
        pickedTerms: data.pickedTerms ?? [],
        pickedSeasonalMeta: data.pickedSeasonalMeta ?? [],
        wouldEnqueue: typeof data.enqueued === 'number' ? data.enqueued : 0,
      })
    } finally {
      setPreviewLoading(false)
    }
  }, [selectedSiteId, minSeasonalScore, batchLimitInput])

  const previewCandidatesInBackground = (): void => {
    if (selectedSiteId == null) {
      setError('请选择站点')
      return
    }
    const limRaw = batchLimitInput.trim()
    if (limRaw !== '') {
      const n = Number(limRaw)
      if (!Number.isFinite(n) || n < 1) {
        setError('本批上限须为 ≥1 的整数')
        return
      }
    }
    setError(null)
    const minS = clampSeasonalMin(minSeasonalScore)
    const lim = parseLimitOverride(batchLimitInput)
    const siteIdSnap = selectedSiteId
    const enqueueReplay: Record<string, unknown> = {
      siteId: siteIdSnap,
      mode: 'seasonal',
      minSeasonalScore: minS,
    }
    if (lim != null) enqueueReplay.limit = lim
    const jobId = startKeywordBatchModePreviewJob(selectedSiteLabel.trim() ? { siteLabel: selectedSiteLabel } : {})
    close()
    void (async () => {
      try {
        const res = await fetch('/api/admin/articles/batch-enqueue', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...enqueueReplay, dryRun: true }),
        })
        const data = (await res.json().catch(() => ({}))) as BatchEnqueueOkJson
        if (!res.ok || data.ok !== true) {
          failKeywordBatchModePreviewJob({
            jobId,
            message: typeof data.error === 'string' ? data.error : `请求失败（HTTP ${res.status}）`,
          })
          return
        }
        const pickedTerms = Array.isArray(data.pickedTerms) ? data.pickedTerms : []
        const meta = Array.isArray(data.pickedSeasonalMeta) ? data.pickedSeasonalMeta : []
        const notices = (Array.isArray(data.errorsSample) ? data.errorsSample : []).slice(0, 6)
        const detailLines =
          meta.length > 0
            ? meta.slice(0, 8).map((m) => `${m.term}（季节分 ${m.seasonalScore.toFixed(2)}）`)
            : undefined
        completeKeywordBatchModePreviewJob({
          jobId,
          summary: {
            mode: 'seasonal',
            titleLabel: '季节峰值',
            pickedTotal: typeof data.enqueued === 'number' ? data.enqueued : pickedTerms.length,
            skipped: typeof data.skipped === 'number' ? data.skipped : 0,
            ...(typeof data.limit === 'number' ? { limit: data.limit } : {}),
            termsPreview: pickedTerms.slice(0, 12),
            ...(notices.length > 0 ? { notices } : {}),
            ...(detailLines && detailLines.length > 0 ? { detailLines } : {}),
            enqueueReplay,
          },
        })
      } catch (e) {
        failKeywordBatchModePreviewJob({
          jobId,
          message: e instanceof Error ? e.message : '请求失败',
        })
      }
    })()
  }

  useEffect(() => {
    if (!open || selectedSiteId == null) {
      setPreview(null)
    }
  }, [open, selectedSiteId])

  const close = (): void => {
    setOpen(false)
    setError(null)
  }

  const pickSite = (s: SiteOption): void => {
    setSelectedSiteId(s.id)
    setSelectedSiteLabel(formatSiteLine(s))
    setSiteQuery('')
    setSiteMenuOpen(false)
  }

  const submit = (): void => {
    if (selectedSiteId == null) {
      setError('请选择站点')
      return
    }
    const minS = clampSeasonalMin(minSeasonalScore)
    const lim = parseLimitOverride(batchLimitInput)
    const jobId = startBatchEnqueueJob(selectedSiteLabel.trim() ? { siteLabel: selectedSiteLabel } : {})
    const siteIdSnap = selectedSiteId
    close()
    void (async () => {
      try {
        const res = await fetch('/api/admin/articles/batch-enqueue', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId: siteIdSnap,
            mode: 'seasonal',
            minSeasonalScore: minS,
            ...(lim != null ? { limit: lim } : {}),
          }),
        })
        const data = (await res.json().catch(() => ({}))) as { error?: string; enqueued?: number; skipped?: number }
        if (!res.ok) {
          failBatchEnqueueJob({ jobId, message: typeof data.error === 'string' ? data.error : '失败' })
          return
        }
        completeBatchEnqueueJob({
          jobId,
          summary: { enqueued: data.enqueued ?? 0, skipped: data.skipped ?? 0 },
        })
      } catch {
        failBatchEnqueueJob({ jobId, message: '请求失败' })
      }
    })()
  }

  const titleId = 'keyword-seasonal-title'

  return (
    <>
      <Button buttonStyle="secondary" onClick={() => setOpen(true)} type="button">
        季节峰值 · Brief
      </Button>
      {open ? (
        <>
          <button
            aria-label="关闭"
            type="button"
            style={{ ...backdropStyle, cursor: 'pointer', border: 'none', appearance: 'none' }}
            onClick={close}
          />
          <div style={{ ...backdropStyle, pointerEvents: 'none' }}>
            <div
              aria-labelledby={titleId}
              role="dialog"
              style={{ ...panelStyle, pointerEvents: 'auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id={titleId} style={{ margin: '0 0 0.75rem', fontSize: '1.125rem', fontWeight: 600 }}>
                季节 / trend → Brief
              </h2>
              <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', opacity: 0.85 }}>
                使用关键词 <code>trend</code>（DFS 月度搜索量）估算当前是否接近年峰值；按 季节分 × 机会分 排序入队。「预览候选」关窗后顶栏
                dry-run；此处点「刷新预览」看带季节分的列表。
              </p>
              {error ? (
                <p style={{ color: 'var(--theme-error-500)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>{error}</p>
              ) : null}

              <div style={{ marginBottom: '1rem' }}>
                <span style={fieldLabel}>站点</span>
                <div ref={siteComboboxRef} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    style={{ ...inputStyle, display: 'flex', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left' }}
                    onClick={() => {
                      setSiteMenuOpen((x) => !x)
                      if (!siteMenuOpen && sites.length === 0) void loadSites('')
                    }}
                  >
                    {selectedSiteLabel || '选择…'}
                    <span style={{ opacity: 0.6 }}>▾</span>
                  </button>
                  {siteMenuOpen ? (
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        zIndex: 2,
                        maxHeight: 180,
                        overflow: 'auto',
                        background: 'var(--theme-elevation-0)',
                        border: '1px solid var(--theme-elevation-150)',
                        marginTop: 4,
                      }}
                    >
                      <input style={inputStyle} value={siteQuery} onChange={(e) => setSiteQuery(e.target.value)} placeholder="搜索" />
                      {sites.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.4rem 0.6rem', border: 'none', background: 'transparent', cursor: 'pointer' }}
                          onClick={() => pickSite(s)}
                        >
                          {formatSiteLine(s)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={fieldLabel}>最低季节分（{minSeasonalScore}）</label>
                <input
                  type="range"
                  min={0.35}
                  max={0.95}
                  step={0.05}
                  value={Number(minSeasonalScore)}
                  onChange={(e) => setMinSeasonalScore(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={fieldLabel}>本批上限（可选）</label>
                <input style={inputStyle} value={batchLimitInput} onChange={(e) => setBatchLimitInput(e.target.value)} />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <Button
                  buttonStyle="secondary"
                  disabled={selectedSiteId == null || previewLoading}
                  onClick={() => void fetchPreview()}
                  type="button"
                >
                  {previewLoading ? '刷新中…' : '刷新预览'}
                </Button>
              </div>

              {preview && selectedSiteId != null ? (
                <div style={{ marginBottom: '1rem', padding: '0.65rem', border: '1px solid var(--theme-elevation-150)', borderRadius: 6, fontSize: '0.78rem' }}>
                  <strong>预览</strong> {previewLoading ? '…' : null}
                  <p style={{ margin: '0.35rem 0 0' }}>将入队 {preview.wouldEnqueue} 条</p>
                  <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1rem', maxHeight: 140, overflow: 'auto' }}>
                    {preview.pickedSeasonalMeta.slice(0, 20).map((m) => (
                      <li key={m.term}>
                        {m.term}{' '}
                        <span style={{ opacity: 0.75 }}>({m.seasonalScore.toFixed(2)})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Button onClick={previewCandidatesInBackground} type="button" disabled={selectedSiteId == null}>
                  预览候选
                </Button>
                <Button buttonStyle="secondary" onClick={close} type="button">
                  关闭
                </Button>
                <Button onClick={submit} type="button" disabled={selectedSiteId == null}>
                  并入队 Brief
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  )
}
