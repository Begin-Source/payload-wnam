'use client'

import { useAdminBackgroundActivity } from '@/components/adminBackgroundActivity/AdminBackgroundActivityProvider'
import type { BatchEnqueueOkJson } from '@/utilities/keywordBatchEnqueuePreview'
import { Button } from '@payloadcms/ui'
import React, { useCallback, useEffect, useRef, useState } from 'react'

type SiteOption = {
  id: number
  name: string
  slug: string
  primaryDomain: string
}

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

const warnStyle: React.CSSProperties = {
  marginBottom: '1rem',
  padding: '0.65rem 0.75rem',
  borderRadius: 6,
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-50)',
  fontSize: '0.8125rem',
  lineHeight: 1.5,
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

/** GEO / AI 引用向 → brief_generate */
export function KeywordGeoDrawer(): React.ReactElement {
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

  const [intentText, setIntentText] = useState('informational, commercial')
  const [geoQuestionOnly, setGeoQuestionOnly] = useState(false)
  const [batchLimitInput, setBatchLimitInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [backfillBusy, setBackfillBusy] = useState(false)
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null)

  const [dryRunPreview, setDryRunPreview] = useState<{
    pickedTerms: string[]
    wouldEnqueue: number
  } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const loadSites = useCallback(async (q: string) => {
    setSitesLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/admin/article-quick-action/options?${params}`, {
        credentials: 'include',
      })
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
    if (!siteMenuOpen) return
    const onDoc = (e: MouseEvent): void => {
      const root = siteComboboxRef.current
      if (root && !root.contains(e.target as Node)) setSiteMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [siteMenuOpen])

  useEffect(() => {
    if (!open || selectedSiteId == null) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/keyword-batch-presets/for-site?siteId=${selectedSiteId}`,
          { credentials: 'include' },
        )
        if (!res.ok || cancelled) return
        const data = (await res.json()) as {
          preset?: {
            batchMode?: string
            defaultBatchLimit?: number | null
            geoIntentWhitelist?: string | null
            geoQuestionOnly?: boolean | null
          } | null
        }
        if (cancelled) return
        const p = data.preset
        if (!p || p.batchMode !== 'geo_friendly') {
          setBatchLimitInput('')
          return
        }
        if (typeof p.geoIntentWhitelist === 'string' && p.geoIntentWhitelist.trim()) {
          setIntentText(p.geoIntentWhitelist.trim())
        }
        if (typeof p.geoQuestionOnly === 'boolean') setGeoQuestionOnly(p.geoQuestionOnly)
        const lim = p.defaultBatchLimit
        if (typeof lim === 'number' && Number.isFinite(lim) && lim >= 1) {
          setBatchLimitInput(String(Math.min(100, Math.floor(lim))))
        }
      } catch {
        if (!cancelled) setBatchLimitInput('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, selectedSiteId])

  const geoIntentsArray = (): string[] => {
    return intentText
      .split(/[,，\s]+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
  }

  const fetchDryRun = useCallback(async () => {
    if (selectedSiteId == null) return
    setPreviewLoading(true)
    setDryRunPreview(null)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        siteId: selectedSiteId,
        mode: 'geo_friendly',
        dryRun: true,
        geoIntentWhitelist: geoIntentsArray(),
        geoQuestionOnly,
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
        setError(typeof data.error === 'string' ? data.error : '预览失败')
        return
      }
      setDryRunPreview({
        pickedTerms: Array.isArray(data.pickedTerms) ? data.pickedTerms : [],
        wouldEnqueue: typeof data.enqueued === 'number' ? data.enqueued : 0,
      })
    } finally {
      setPreviewLoading(false)
    }
  }, [selectedSiteId, intentText, geoQuestionOnly, batchLimitInput])

  const close = (): void => {
    setOpen(false)
    setError(null)
    setBackfillMsg(null)
  }

  const pickSite = (s: SiteOption): void => {
    setSelectedSiteId(s.id)
    setSelectedSiteLabel(formatSiteLine(s))
    setSiteQuery('')
    setSiteMenuOpen(false)
  }

  const runBackfill = async (): Promise<void> => {
    if (selectedSiteId == null) {
      setError('请选择站点')
      return
    }
    setBackfillBusy(true)
    setBackfillMsg(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/keywords/backfill-geo-friendly', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedSiteId }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        scanned?: number
        updated?: number
      }
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '回填失败')
        return
      }
      setBackfillMsg(`已扫描 ${data.scanned ?? 0} 条，更新 ${data.updated ?? 0} 条 geoFriendly`)
      void fetchDryRun()
    } finally {
      setBackfillBusy(false)
    }
  }

  const submit = (): void => {
    if (selectedSiteId == null) {
      setError('请选择站点')
      return
    }
    const limRaw = batchLimitInput.trim()
    let limit: number | undefined
    if (limRaw !== '') {
      const n = Number(limRaw)
      if (!Number.isFinite(n) || n < 1) {
        setError('本批上限须为 ≥1 的整数')
        return
      }
      limit = Math.min(100, Math.floor(n))
    }

    const siteLabelSnap = selectedSiteLabel.trim()
    const siteIdSnap = selectedSiteId
    const intentsSnap = geoIntentsArray()
    const qOnly = geoQuestionOnly
    const jobId = startBatchEnqueueJob(siteLabelSnap ? { siteLabel: siteLabelSnap } : {})
    close()
    void (async () => {
      try {
        const res = await fetch('/api/admin/articles/batch-enqueue', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId: siteIdSnap,
            mode: 'geo_friendly',
            geoIntentWhitelist: intentsSnap,
            geoQuestionOnly: qOnly,
            ...(limit != null ? { limit } : {}),
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
          enqueued?: number
          skipped?: number
        }
        if (!res.ok) {
          failBatchEnqueueJob({
            jobId,
            message: typeof data.error === 'string' ? data.error : '批量入队失败',
          })
          return
        }
        completeBatchEnqueueJob({
          jobId,
          summary: {
            enqueued: data.enqueued ?? 0,
            skipped: data.skipped ?? 0,
          },
        })
      } catch {
        failBatchEnqueueJob({ jobId, message: '批量入队请求失败' })
      }
    })()
  }

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
    const siteLabelSnap = selectedSiteLabel.trim()
    const siteIdSnap = selectedSiteId
    const intentsSnap = geoIntentsArray()
    const qOnly = geoQuestionOnly
    let limit: number | undefined
    if (limRaw !== '') {
      limit = Math.min(100, Math.floor(Number(limRaw)))
    }
    const enqueueReplay: Record<string, unknown> = {
      siteId: siteIdSnap,
      mode: 'geo_friendly',
      geoIntentWhitelist: intentsSnap,
      geoQuestionOnly: qOnly,
    }
    if (limit != null) enqueueReplay.limit = limit
    const jobId = startKeywordBatchModePreviewJob(siteLabelSnap ? { siteLabel: siteLabelSnap } : {})
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
        const notices = (Array.isArray(data.errorsSample) ? data.errorsSample : []).slice(0, 6)
        completeKeywordBatchModePreviewJob({
          jobId,
          summary: {
            mode: 'geo_friendly',
            titleLabel: 'GEO 向',
            pickedTotal: typeof data.enqueued === 'number' ? data.enqueued : pickedTerms.length,
            skipped: typeof data.skipped === 'number' ? data.skipped : 0,
            ...(typeof data.limit === 'number' ? { limit: data.limit } : {}),
            termsPreview: pickedTerms.slice(0, 12),
            ...(notices.length > 0 ? { notices } : {}),
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
      setDryRunPreview(null)
    }
  }, [open, selectedSiteId])

  const titleId = 'keyword-geo-title'

  return (
    <>
      <Button buttonStyle="secondary" onClick={() => setOpen(true)} type="button">
        GEO 向 · Brief
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
              onClick={(ev) => ev.stopPropagation()}
              onKeyDown={(ev) => {
                if (ev.key === 'Escape') close()
              }}
            >
              <h2 id={titleId} style={{ margin: '0 0 0.75rem', fontSize: '1.125rem', fontWeight: 600 }}>
                GEO / AI 引用向 → Brief
              </h2>
              <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', opacity: 0.85, lineHeight: 1.5 }}>
                仅 <code>geoFriendly=true</code> 且符合意图的关键词入队 <code>brief_generate</code>。新词请在「同步拉取
                · DFS」后自动打标；存量可点「回填 geo」按 term 规则重算。「预览候选」会关窗并在顶栏展示 dry-run，可一键并入队；抽屉内需先点「刷新预览」查看本地摘要。
              </p>
              <div style={warnStyle}>
                <strong>提示</strong>：若预览为空，请先对本站执行「回填 geo」或确认 DFS 同步已写入 geoFriendly。
              </div>

              {error ? (
                <p style={{ color: 'var(--theme-error-500)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
                  {error}
                </p>
              ) : null}
              {backfillMsg ? (
                <p style={{ fontSize: '0.8125rem', marginBottom: '0.75rem', opacity: 0.9 }}>{backfillMsg}</p>
              ) : null}

              <div style={{ marginBottom: '1rem' }}>
                <span style={fieldLabel}>站点</span>
                <div ref={siteComboboxRef} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    aria-expanded={siteMenuOpen}
                    style={{ ...inputStyle, textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                    onClick={() => {
                      setSiteMenuOpen((x) => !x)
                      if (!siteMenuOpen && sites.length === 0) void loadSites('')
                    }}
                  >
                    <span>{selectedSiteLabel || '选择站点…'}</span>
                    <span style={{ opacity: 0.6 }}>▾</span>
                  </button>
                  {siteMenuOpen ? (
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        marginTop: 4,
                        maxHeight: '14rem',
                        overflow: 'auto',
                        borderRadius: 4,
                        border: '1px solid var(--theme-elevation-150)',
                        background: 'var(--theme-elevation-0)',
                        zIndex: 2,
                      }}
                    >
                      <input
                        aria-label="筛选站点"
                        placeholder="搜索…"
                        style={{ ...inputStyle, borderRadius: 0, border: 'none', borderBottom: '1px solid var(--theme-elevation-150)' }}
                        value={siteQuery}
                        onChange={(e) => setSiteQuery(e.target.value)}
                      />
                      {sitesLoading ? (
                        <div style={{ padding: '0.5rem', fontSize: '0.75rem' }}>加载中…</div>
                      ) : (
                        sites.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            style={{
                              display: 'block',
                              width: '100%',
                              textAlign: 'left',
                              padding: '0.45rem 0.65rem',
                              fontSize: '0.8125rem',
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                            }}
                            onClick={() => pickSite(s)}
                          >
                            {formatSiteLine(s)}
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <label style={fieldLabel}>意图（逗号分隔）</label>
                <input style={inputStyle} value={intentText} onChange={(e) => setIntentText(e.target.value)} />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
                <input type="checkbox" checked={geoQuestionOnly} onChange={(e) => setGeoQuestionOnly(e.target.checked)} />
                <span style={{ fontSize: '0.8125rem' }}>仅问句 / 定义型（? 或疑问词开头）</span>
              </label>

              <div style={{ marginBottom: '1rem' }}>
                <label style={fieldLabel}>本批入队上限（可选）</label>
                <input
                  style={inputStyle}
                  inputMode="numeric"
                  value={batchLimitInput}
                  onChange={(e) => setBatchLimitInput(e.target.value)}
                  placeholder="留空使用服务端默认"
                />
              </div>

              <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Button buttonStyle="secondary" disabled={backfillBusy || selectedSiteId == null} onClick={() => void runBackfill()} type="button">
                  {backfillBusy ? '回填中…' : '回填本站 geoFriendly'}
                </Button>
                <Button
                  buttonStyle="secondary"
                  disabled={selectedSiteId == null || previewLoading}
                  onClick={() => void fetchDryRun()}
                  type="button"
                >
                  {previewLoading ? '刷新中…' : '刷新预览'}
                </Button>
              </div>

              {selectedSiteId != null ? (
                <div
                  style={{
                    marginBottom: '1rem',
                    padding: '0.75rem',
                    borderRadius: 6,
                    border: '1px solid var(--theme-elevation-150)',
                    fontSize: '0.78rem',
                  }}
                >
                  <strong>预览（dry-run，不入队）</strong>
                  {previewLoading ? <p style={{ margin: '0.35rem 0 0' }}>计算中…</p> : null}
                  {!previewLoading && dryRunPreview ? (
                    <>
                      <p style={{ margin: '0.35rem 0 0' }}>
                        将入队约 <strong>{dryRunPreview.wouldEnqueue}</strong> 条
                      </p>
                      {dryRunPreview.pickedTerms.length > 0 ? (
                        <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', maxHeight: '8rem', overflow: 'auto' }}>
                          {dryRunPreview.pickedTerms.slice(0, 20).map((t) => (
                            <li key={t}>{t}</li>
                          ))}
                        </ul>
                      ) : (
                        <p style={{ margin: '0.35rem 0 0', opacity: 0.85 }}>无候选</p>
                      )}
                    </>
                  ) : null}
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
