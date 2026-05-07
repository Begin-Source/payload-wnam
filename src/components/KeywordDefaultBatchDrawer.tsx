'use client'

import { useAdminBackgroundActivity } from '@/components/adminBackgroundActivity/AdminBackgroundActivityProvider'

import { Button } from '@payloadcms/ui'
import React, { useCallback, useEffect, useRef, useState } from 'react'

type SiteOption = {
  id: number
  name: string
  slug: string
  primaryDomain: string
  mainProduct?: string | null
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

function formatSiteLine(s: SiteOption): string {
  return `${s.name} (${s.slug}) ${s.primaryDomain}`
}

type DryRunPreview = {
  defaultLimit: number
  effectiveLimit: number
  usedKeywordFallback: boolean
  wouldEnqueue: number
  wouldSkip: number
  pickedTerms: string[]
  errorsSample: string[]
}

function parseLimitOverride(batchLimitInput: string): number | undefined {
  const lim = batchLimitInput.trim()
  if (lim === '') return undefined
  const n = Number(lim)
  if (!Number.isFinite(n) || n < 1) return undefined
  return Math.min(100, Math.floor(n))
}

/** Keywords list: default opportunity-sorted keywords → `brief_generate` batch (same API as Articles batch). */
export function KeywordDefaultBatchDrawer(): React.ReactElement {
  const { startBatchEnqueueJob, completeBatchEnqueueJob, failBatchEnqueueJob } =
    useAdminBackgroundActivity()

  const [open, setOpen] = useState(false)
  const [siteQuery, setSiteQuery] = useState('')
  const [sites, setSites] = useState<SiteOption[]>([])
  const [sitesLoading, setSitesLoading] = useState(false)
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null)
  const [selectedSiteLabel, setSelectedSiteLabel] = useState('')
  const [siteMenuOpen, setSiteMenuOpen] = useState(false)
  const siteComboboxRef = useRef<HTMLDivElement>(null)

  const [batchLimitInput, setBatchLimitInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [dryRunPreview, setDryRunPreview] = useState<DryRunPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const loadSites = useCallback(async (q: string) => {
    setSitesLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/admin/article-quick-action/options?${params}`, {
        credentials: 'include',
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: unknown }
        throw new Error(typeof err.error === 'string' ? err.error : '加载站点失败')
      }
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
    const t = window.setTimeout(() => {
      void loadSites(siteQuery)
    }, 300)
    return () => window.clearTimeout(t)
  }, [open, siteMenuOpen, siteQuery, loadSites])

  useEffect(() => {
    if (!siteMenuOpen) return
    const onDocMouseDown = (e: MouseEvent): void => {
      const root = siteComboboxRef.current
      if (root && !root.contains(e.target as Node)) {
        setSiteMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [siteMenuOpen])

  useEffect(() => {
    if (!siteMenuOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setSiteMenuOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [siteMenuOpen])

  const previewRequestSeqRef = useRef(0)

  /** After site pick, prefill batch limit from site's keyword batch preset when set. */
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
          preset?: { defaultBatchLimit?: number | null } | null
        }
        if (cancelled) return
        const p = data.preset
        if (!p) {
          setBatchLimitInput('')
          return
        }
        const lim = p.defaultBatchLimit
        if (typeof lim === 'number' && Number.isFinite(lim) && lim >= 1) {
          setBatchLimitInput(String(Math.min(100, Math.floor(lim))))
        } else {
          setBatchLimitInput('')
        }
      } catch {
        if (!cancelled) setBatchLimitInput('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, selectedSiteId])

  const fetchDryRunPreview = useCallback(async (siteId: number, limit?: number) => {
    const seq = ++previewRequestSeqRef.current
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const body: Record<string, unknown> = { siteId, dryRun: true }
      if (limit != null) body.limit = limit
      const res = await fetch('/api/admin/articles/batch-enqueue', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        defaultLimit?: number
        limit?: number
        usedKeywordFallback?: boolean
        enqueued?: number
        skipped?: number
        pickedTerms?: string[]
        errorsSample?: string[]
      }
      if (seq !== previewRequestSeqRef.current) return
      if (!res.ok) {
        setDryRunPreview(null)
        setPreviewError(typeof data.error === 'string' ? data.error : '预览失败')
        return
      }
      setDryRunPreview({
        defaultLimit: typeof data.defaultLimit === 'number' ? data.defaultLimit : 0,
        effectiveLimit: typeof data.limit === 'number' ? data.limit : 0,
        usedKeywordFallback: data.usedKeywordFallback === true,
        wouldEnqueue: typeof data.enqueued === 'number' ? data.enqueued : 0,
        wouldSkip: typeof data.skipped === 'number' ? data.skipped : 0,
        pickedTerms: Array.isArray(data.pickedTerms) ? data.pickedTerms : [],
        errorsSample: Array.isArray(data.errorsSample) ? data.errorsSample : [],
      })
    } catch {
      if (seq !== previewRequestSeqRef.current) return
      setDryRunPreview(null)
      setPreviewError('预览请求失败')
    } finally {
      if (seq === previewRequestSeqRef.current) {
        setPreviewLoading(false)
      }
    }
  }, [])

  const prevSiteForPreviewRef = useRef<number | null>(null)

  useEffect(() => {
    if (!open) {
      prevSiteForPreviewRef.current = null
      setDryRunPreview(null)
      setPreviewError(null)
      setPreviewLoading(false)
      return
    }
    if (selectedSiteId == null) {
      prevSiteForPreviewRef.current = null
      setDryRunPreview(null)
      setPreviewError(null)
      setPreviewLoading(false)
      return
    }

    const siteChanged = prevSiteForPreviewRef.current !== selectedSiteId
    prevSiteForPreviewRef.current = selectedSiteId
    const delay = siteChanged ? 0 : 450
    const siteIdSnap = selectedSiteId
    const limitArg = parseLimitOverride(batchLimitInput)

    const t = window.setTimeout(() => {
      void fetchDryRunPreview(siteIdSnap, limitArg)
    }, delay)
    return () => window.clearTimeout(t)
  }, [open, selectedSiteId, batchLimitInput, fetchDryRunPreview])

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
    const lim = batchLimitInput.trim()
    let limit: number | undefined
    if (lim !== '') {
      const n = Number(lim)
      if (!Number.isFinite(n) || n < 1) {
        setError('本批上限须为 ≥1 的整数，或留空使用默认')
        return
      }
      limit = Math.min(100, Math.floor(n))
    }

    const siteLabelSnap = selectedSiteLabel.trim()
    const siteIdSnap = selectedSiteId
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
            ...(limit != null ? { limit } : {}),
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
          enqueued?: number
          skipped?: number
          usedKeywordFallback?: boolean
          errorsSample?: string[]
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
            usedKeywordFallback: data.usedKeywordFallback,
            errorsSample: data.errorsSample,
          },
        })
      } catch {
        failBatchEnqueueJob({ jobId, message: '批量入队请求失败' })
      }
    })()
  }

  const titleId = 'keyword-default-batch-title'

  return (
    <>
      <Button buttonStyle="secondary" onClick={() => setOpen(true)} type="button">
        默认排产 · Brief
      </Button>
      {open ? (
        <>
          <button
            aria-label="关闭"
            type="button"
            style={{
              ...backdropStyle,
              cursor: 'pointer',
              border: 'none',
              appearance: 'none',
            }}
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
                默认批量排产 → Brief
              </h2>
              <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', opacity: 0.85, lineHeight: 1.5 }}>
                按站点机会分排序的 <code>active</code>（若无则 <code>draft</code>）关键词入队{' '}
                <code>brief_generate</code>，与「快捷操作 · 文章」中的批量排产相同。提交后弹窗关闭，进度与结果见顶栏
                Banner。
              </p>

              {error ? (
                <p style={{ color: 'var(--theme-error-500)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
                  {error}
                </p>
              ) : null}

              <div style={{ marginBottom: '1rem' }}>
                <span style={fieldLabel}>站点</span>
                <div ref={siteComboboxRef} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    aria-expanded={siteMenuOpen}
                    aria-haspopup="listbox"
                    style={{
                      ...inputStyle,
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
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
                      role="listbox"
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
                        placeholder="搜索站点名称 / slug / 域名"
                        style={{
                          ...inputStyle,
                          borderRadius: 0,
                          borderLeft: 'none',
                          borderRight: 'none',
                          borderTop: 'none',
                        }}
                        value={siteQuery}
                        onChange={(e) => setSiteQuery(e.target.value)}
                      />
                      {sitesLoading ? (
                        <div style={{ padding: '0.5rem', fontSize: '0.75rem', opacity: 0.8 }}>加载中…</div>
                      ) : (
                        sites.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            role="option"
                            aria-selected={selectedSiteId === s.id}
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

              {selectedSiteId != null ? (
                <div
                  style={{
                    marginBottom: '1rem',
                    padding: '0.75rem 0.85rem',
                    borderRadius: 6,
                    border: '1px solid var(--theme-elevation-150)',
                    background: 'var(--theme-elevation-50)',
                    fontSize: '0.78rem',
                    lineHeight: 1.45,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.8rem' }}>
                    参数预览（dry-run，不入队）
                  </div>
                  {previewLoading ? (
                    <p style={{ margin: 0, opacity: 0.85 }}>正在拉取服务端计算结果…</p>
                  ) : null}
                  {previewError ? (
                    <p style={{ margin: 0, color: 'var(--theme-error-500)' }}>{previewError}</p>
                  ) : null}
                  {!previewLoading && dryRunPreview ? (
                    <>
                      <ul style={{ margin: '0.35rem 0 0.5rem', paddingLeft: '1.1rem' }}>
                        <li>
                          <strong>模式</strong>：<code>default</code>（机会分排序；无 Quick-win / SERP 聚类）
                        </li>
                        <li>
                          <strong>关键词状态</strong>：优先 <code>active</code>
                          {dryRunPreview.usedKeywordFallback ? (
                            <>；当前站点无 active，已用 <code>draft</code> 池</>
                          ) : (
                            <>；使用 <code>active</code> 池</>
                          )}
                        </li>
                        <li>
                          <strong>服务端推导默认上限</strong>（来自站点日更配额等）：{' '}
                          <code>{dryRunPreview.defaultLimit}</code>
                        </li>
                        <li>
                          <strong>本轮生效上限</strong>（与下文「本批入队上限」一致时为准）：{' '}
                          <code>{dryRunPreview.effectiveLimit}</code>
                          {batchLimitInput.trim() === '' ? (
                            <span style={{ opacity: 0.85 }}>（未手动覆盖）</span>
                          ) : (
                            <span style={{ opacity: 0.85 }}>（已按你填写的上限参与预览）</span>
                          )}
                        </li>
                        <li>
                          <strong>模拟入队 / 跳过</strong>：{dryRunPreview.wouldEnqueue} /{' '}
                          {dryRunPreview.wouldSkip}
                        </li>
                      </ul>
                      {dryRunPreview.pickedTerms.length > 0 ? (
                        <div style={{ marginTop: '0.35rem' }}>
                          <strong>将 pick 的词（前 {Math.min(25, dryRunPreview.pickedTerms.length)} 条）</strong>
                          <ul
                            style={{
                              margin: '0.25rem 0 0',
                              paddingLeft: '1.1rem',
                              maxHeight: '9rem',
                              overflow: 'auto',
                            }}
                          >
                            {dryRunPreview.pickedTerms.slice(0, 25).map((t, idx) => (
                              <li key={`${idx}-${t}`}>{t}</li>
                            ))}
                          </ul>
                        </div>
                      ) : !previewError && dryRunPreview.wouldEnqueue === 0 ? (
                        <p style={{ margin: '0.35rem 0 0', opacity: 0.9 }}>当前无可入队候选。</p>
                      ) : null}
                      {dryRunPreview.errorsSample.length > 0 ? (
                        <div style={{ marginTop: '0.5rem', opacity: 0.92 }}>
                          <strong>说明 / 样例</strong>
                          <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1.1rem' }}>
                            {dryRunPreview.errorsSample.slice(0, 6).map((m) => (
                              <li key={m}>{m}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <p style={{ margin: '0.6rem 0 0', opacity: 0.8, fontSize: '0.72rem' }}>
                        修改下文「本批入队上限」后约半秒会自动重算预览；仅「并入队 Brief」才会真正写任务。
                      </p>
                    </>
                  ) : !previewLoading && !previewError && !dryRunPreview ? (
                    <p style={{ margin: 0, opacity: 0.85 }}>正在准备预览…</p>
                  ) : null}
                  <div style={{ marginTop: '0.5rem' }}>
                    <Button
                      buttonStyle="secondary"
                      size="small"
                      type="button"
                      disabled={previewLoading || selectedSiteId == null}
                      onClick={() => {
                        if (selectedSiteId == null) return
                        void fetchDryRunPreview(selectedSiteId, parseLimitOverride(batchLimitInput))
                      }}
                    >
                      立即刷新预览
                    </Button>
                  </div>
                </div>
              ) : null}

              <div style={{ marginBottom: '1rem' }}>
                <label style={fieldLabel} htmlFor="keyword-default-batch-limit">
                  本批入队上限（可选，覆盖上方预览中的生效上限）
                </label>
                <input
                  id="keyword-default-batch-limit"
                  style={inputStyle}
                  inputMode="numeric"
                  value={batchLimitInput}
                  onChange={(e) => setBatchLimitInput(e.target.value)}
                  placeholder="留空 = 使用服务端推导默认上限（见预览）"
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Button buttonStyle="secondary" onClick={close} type="button">
                  关闭
                </Button>
                <Button onClick={submit} type="button">
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
