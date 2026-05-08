'use client'

import { useAdminBackgroundActivity } from '@/components/adminBackgroundActivity/AdminBackgroundActivityProvider'
import type { BatchEnqueueOkJson } from '@/utilities/keywordBatchEnqueuePreview'
import { Button } from '@payloadcms/ui'
import React, { useCallback, useEffect, useRef, useState } from 'react'

type SiteOption = { id: number; name: string; slug: string; primaryDomain: string }
type PillarRow = { id: number; term: string; spokeCount: number }

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

/** Pillar + 簇内词一同入队 brief_generate */
export function KeywordPillarSprintDrawer(): React.ReactElement {
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

  const [pillars, setPillars] = useState<PillarRow[]>([])
  const [pillarsLoading, setPillarsLoading] = useState(false)
  const [pillarIdInput, setPillarIdInput] = useState('')
  const [batchLimitInput, setBatchLimitInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [preview, setPreview] = useState<{ pickedTerms: string[]; wouldEnqueue: number } | null>(null)
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

  const loadPillars = useCallback(async (siteId: number) => {
    setPillarsLoading(true)
    try {
      const res = await fetch(`/api/admin/keywords/pillar-options?siteId=${siteId}`, {
        credentials: 'include',
      })
      if (!res.ok) {
        setPillars([])
        return
      }
      const data = (await res.json()) as { pillars?: PillarRow[] }
      setPillars(data.pillars ?? [])
    } catch {
      setPillars([])
    } finally {
      setPillarsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open || selectedSiteId == null) {
      setPillars([])
      return
    }
    void loadPillars(selectedSiteId)
  }, [open, selectedSiteId, loadPillars])

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
            pillarKeywordId?: number | null
          } | null
        }
        if (cancelled) return
        const p = data.preset
        if (p?.batchMode === 'pillar_sprint' && typeof p.pillarKeywordId === 'number' && p.pillarKeywordId >= 1) {
          setPillarIdInput(String(p.pillarKeywordId))
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

  const effectivePillarId = (): number | null => {
    const n = Number(pillarIdInput.trim())
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null
  }

  const runPreview = useCallback(async () => {
    const pid = effectivePillarId()
    if (selectedSiteId == null || pid == null) {
      setPreview(null)
      return
    }
    setPreviewLoading(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        siteId: selectedSiteId,
        mode: 'pillar_sprint',
        pillarId: pid,
        dryRun: true,
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
        wouldEnqueue: typeof data.enqueued === 'number' ? data.enqueued : 0,
      })
    } finally {
      setPreviewLoading(false)
    }
  }, [selectedSiteId, pillarIdInput, batchLimitInput])

  const previewCandidatesInBackground = (): void => {
    const pid = effectivePillarId()
    if (selectedSiteId == null || pid == null) {
      setError('请选择站点并填写 pillar 关键词 ID')
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
    const lim = parseLimitOverride(batchLimitInput)
    const siteIdSnap = selectedSiteId
    const enqueueReplay: Record<string, unknown> = {
      siteId: siteIdSnap,
      mode: 'pillar_sprint',
      pillarId: pid,
    }
    if (lim != null) enqueueReplay.limit = lim
    const jobId = startKeywordBatchModePreviewJob(
      selectedSiteLabel.trim() ? { siteLabel: selectedSiteLabel } : {},
    )
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
            mode: 'pillar_sprint',
            titleLabel: 'Pillar 冲刺',
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
    if (!open) {
      setPreview(null)
    }
  }, [open])

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
    const pid = effectivePillarId()
    if (selectedSiteId == null || pid == null) {
      setError('请选择站点并填写 pillar 关键词 ID')
      return
    }
    const lim = parseLimitOverride(batchLimitInput)
    const jobId = startBatchEnqueueJob(
      selectedSiteLabel.trim() ? { siteLabel: selectedSiteLabel } : {},
    )
    close()
    void (async () => {
      try {
        const res = await fetch('/api/admin/articles/batch-enqueue', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId: selectedSiteId,
            mode: 'pillar_sprint',
            pillarId: pid,
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

  const titleId = 'keyword-pillar-sprint-title'

  return (
    <>
      <Button buttonStyle="secondary" onClick={() => setOpen(true)} type="button">
        Pillar 冲刺 · Brief
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
                Pillar 冲刺 → Brief
              </h2>
              <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', opacity: 0.85, lineHeight: 1.5 }}>
                将指定 pillar 与其簇内词按顺序入队 <code>brief_generate</code>。若无下拉候选，请先用「精选 Quick-win」勾选「入队前
                SERP 聚类」跑一轮以写入 <code>keywords.pillar</code>。「预览候选」关窗后顶栏展示 dry-run；此处需点「刷新预览」看本地列表。
              </p>

              {error ? (
                <p style={{ color: 'var(--theme-error-500)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>{error}</p>
              ) : null}

              <div style={{ marginBottom: '1rem' }}>
                <span style={fieldLabel}>站点</span>
                <div ref={siteComboboxRef} style={{ position: 'relative' }}>
                  <button
                    type="button"
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
                        zIndex: 2,
                        marginTop: 4,
                        maxHeight: 200,
                        overflow: 'auto',
                        border: '1px solid var(--theme-elevation-150)',
                        background: 'var(--theme-elevation-0)',
                        borderRadius: 4,
                      }}
                    >
                      <input
                        style={{ ...inputStyle, border: 'none', borderBottom: '1px solid var(--theme-elevation-150)' }}
                        value={siteQuery}
                        onChange={(e) => setSiteQuery(e.target.value)}
                        placeholder="搜索站点"
                      />
                      {sitesLoading ? (
                        <div style={{ padding: '0.5rem' }}>…</div>
                      ) : (
                        sites.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.45rem', border: 'none', background: 'transparent', cursor: 'pointer' }}
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
                <label style={fieldLabel}>Pillar 关键词 ID</label>
                <input
                  style={inputStyle}
                  inputMode="numeric"
                  value={pillarIdInput}
                  onChange={(e) => setPillarIdInput(e.target.value)}
                  placeholder="从下方列表选择或手工填写"
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <span style={fieldLabel}>本站 pillar 候选（≥2 子词）</span>
                {pillarsLoading ? (
                  <div style={inputStyle}>加载中…</div>
                ) : pillars.length === 0 ? (
                  <div style={{ ...inputStyle, opacity: 0.8 }}>暂无（需先 SERP 聚类）</div>
                ) : (
                  <select
                    style={inputStyle}
                    value=""
                    onChange={(e) => {
                      const v = e.target.value
                      if (v) setPillarIdInput(v)
                    }}
                  >
                    <option value="">— 选择填入 ID —</option>
                    {pillars.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.term}（ID {p.id}，{p.spokeCount} 子词）
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={fieldLabel}>本批上限（可选）</label>
                <input style={inputStyle} value={batchLimitInput} onChange={(e) => setBatchLimitInput(e.target.value)} />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <Button
                  buttonStyle="secondary"
                  disabled={selectedSiteId == null || effectivePillarId() == null || previewLoading}
                  onClick={() => void runPreview()}
                  type="button"
                >
                  {previewLoading ? '刷新中…' : '刷新预览'}
                </Button>
              </div>

              {preview ? (
                <div style={{ marginBottom: '1rem', padding: '0.65rem', border: '1px solid var(--theme-elevation-150)', borderRadius: 6, fontSize: '0.78rem' }}>
                  <strong>预览</strong>
                  {previewLoading ? <span> …</span> : null}
                  <p style={{ margin: '0.35rem 0 0' }}>将入队 {preview.wouldEnqueue} 条</p>
                  <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1rem', maxHeight: 120, overflow: 'auto' }}>
                    {preview.pickedTerms.slice(0, 25).map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Button
                  onClick={previewCandidatesInBackground}
                  type="button"
                  disabled={selectedSiteId == null || effectivePillarId() == null}
                >
                  预览候选
                </Button>
                <Button buttonStyle="secondary" onClick={close} type="button">
                  关闭
                </Button>
                <Button onClick={submit} type="button" disabled={selectedSiteId == null || effectivePillarId() == null}>
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
