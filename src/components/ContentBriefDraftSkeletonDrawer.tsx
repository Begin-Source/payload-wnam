'use client'

import { Button } from '@payloadcms/ui'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { useAdminBackgroundActivity } from '@/components/adminBackgroundActivity/AdminBackgroundActivityContext'
import { showEphemeralAdminToast } from '@/utilities/adminEphemeralToast'

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
  width: 'min(34rem, 100%)',
  maxHeight: '90vh',
  overflow: 'auto',
  borderRadius: 8,
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-0)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  padding: '1.25rem 1.5rem',
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

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 600,
  marginBottom: '0.35rem',
  opacity: 0.85,
}

const DEFAULT_SITE_LIMIT = 25

type SiteOption = {
  id: number
  name: string
  slug: string
  primaryDomain: string
}

function formatSiteLine(s: SiteOption): string {
  return `${s.name} (${s.slug}) ${s.primaryDomain}`
}

type ResultRow = {
  briefId: number
  created: boolean
  jobId?: number
  reason?: string
}

/** Content-briefs list: enqueue `draft_skeleton` by site + oldest-first limit. */
export function ContentBriefDraftSkeletonDrawer(): React.ReactElement {
  const {
    startContentBriefDraftSkeletonPreviewJob,
    completeContentBriefDraftSkeletonPreviewJob,
    failContentBriefDraftSkeletonPreviewJob,
  } = useAdminBackgroundActivity()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summaryLines, setSummaryLines] = useState<string[]>([])

  const [siteQuery, setSiteQuery] = useState('')
  const [sites, setSites] = useState<SiteOption[]>([])
  const [sitesLoading, setSitesLoading] = useState(false)
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null)
  const [selectedSiteLabel, setSelectedSiteLabel] = useState('')
  const [siteMenuOpen, setSiteMenuOpen] = useState(false)
  const siteComboboxRef = useRef<HTMLDivElement>(null)
  const skipSiteQueryDebounceRef = useRef(false)

  const [limitInput, setLimitInput] = useState(String(DEFAULT_SITE_LIMIT))

  const loadSites = useCallback(async (q: string) => {
    setSitesLoading(true)
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
      setSites([])
      setError(e instanceof Error ? e.message : '加载站点失败')
    } finally {
      setSitesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open && !sitesLoading && sites.length === 0) {
      void loadSites('')
    }
  }, [open, sitesLoading, sites.length, loadSites])

  useEffect(() => {
    if (!open || !siteMenuOpen) return
    if (skipSiteQueryDebounceRef.current) {
      skipSiteQueryDebounceRef.current = false
      return
    }
    const t = window.setTimeout(() => {
      void loadSites(siteQuery)
    }, 300)
    return () => window.clearTimeout(t)
  }, [open, siteMenuOpen, siteQuery, loadSites])

  useEffect(() => {
    if (!open) return
    const onDoc = (ev: MouseEvent): void => {
      const el = siteComboboxRef.current
      if (el && !el.contains(ev.target as Node)) {
        setSiteMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc, true)
    return () => document.removeEventListener('mousedown', onDoc, true)
  }, [open])

  function close(): void {
    setOpen(false)
    setError(null)
    setSummaryLines([])
    setSiteMenuOpen(false)
  }

  function pickSite(s: SiteOption): void {
    setSelectedSiteId(s.id)
    setSelectedSiteLabel(formatSiteLine(s))
    setSiteQuery('')
    setSiteMenuOpen(false)
    skipSiteQueryDebounceRef.current = true
  }

  function summarizeResults(results: ResultRow[]): string[] {
    const created = results.filter((r) => r.created).length
    const skipped = results.filter((r) => !r.created).length
    const lines = [`新建任务 ${created} 条，跳过/失败 ${skipped} 条`]
    const sample = results
      .filter((r) => !r.created && r.reason)
      .slice(0, 8)
      .map((r) => `大纲 #${r.briefId}: ${r.reason}`)
    lines.push(...sample)
    if (results.length > 0 && sample.length < skipped) {
      lines.push('… 其余见下方列表或工作流任务')
    }
    return lines
  }

  async function previewSite(): Promise<void> {
    if (selectedSiteId == null) {
      setError('请选择站点')
      return
    }
    const limRaw = limitInput.trim()
    const lim = limRaw === '' ? DEFAULT_SITE_LIMIT : Number(limRaw)
    if (!Number.isFinite(lim) || lim < 1 || lim > 50) {
      setError('条数上限须为 1–50 的整数')
      return
    }

    const siteLabelSnap = selectedSiteLabel
    const siteId = selectedSiteId
    const limitFloored = Math.floor(lim)

    const jobId = startContentBriefDraftSkeletonPreviewJob(
      siteLabelSnap.trim() ? { siteLabel: siteLabelSnap } : {},
    )
    close()

    void (async () => {
      try {
        const res = await fetch('/api/admin/content-briefs/enqueue-draft-skeleton', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId, limit: limitFloored, dryRun: true }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
          dryRun?: boolean
          siteId?: number
          limit?: number
          queriedCount?: number
          preview?: Array<{ briefId?: number; wouldCreate?: boolean; reason?: string }>
        }
        if (!res.ok || data.ok !== true || data.dryRun !== true) {
          failContentBriefDraftSkeletonPreviewJob({
            jobId,
            message:
              typeof data.error === 'string' ? data.error : `请求失败（HTTP ${res.status}）`,
          })
          return
        }

        const preview = Array.isArray(data.preview) ? data.preview : []
        const wouldCreate = preview.filter((r) => r.wouldCreate === true).length
        const skipped = preview.length - wouldCreate
        const briefIdsPreview = preview
          .filter((r) => r.wouldCreate === true && typeof r.briefId === 'number')
          .map((r) => r.briefId as number)
          .slice(0, 12)
        const skipSamples = preview
          .filter((r) => r.wouldCreate !== true && typeof r.briefId === 'number' && r.reason)
          .slice(0, 8)
          .map((r) => ({ briefId: r.briefId as number, reason: String(r.reason) }))

        completeContentBriefDraftSkeletonPreviewJob({
          jobId,
          summary: {
            siteId: typeof data.siteId === 'number' ? data.siteId : siteId,
            limit: typeof data.limit === 'number' ? data.limit : limitFloored,
            queriedCount: typeof data.queriedCount === 'number' ? data.queriedCount : preview.length,
            wouldCreate,
            skipped,
            briefIdsPreview,
            skipSamples,
            enqueueReplay: { siteId, limit: limitFloored },
          },
        })
      } catch {
        failContentBriefDraftSkeletonPreviewJob({
          jobId,
          message: '预览请求失败',
        })
      }
    })()
  }

  async function submitSite(): Promise<void> {
    if (selectedSiteId == null) {
      setError('请选择站点')
      return
    }
    const limRaw = limitInput.trim()
    const lim = limRaw === '' ? DEFAULT_SITE_LIMIT : Number(limRaw)
    if (!Number.isFinite(lim) || lim < 1 || lim > 50) {
      setError('条数上限须为 1–50 的整数')
      return
    }

    setBusy(true)
    setError(null)
    setSummaryLines([])
    try {
      const res = await fetch('/api/admin/content-briefs/enqueue-draft-skeleton', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedSiteId, limit: Math.floor(lim) }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        results?: ResultRow[]
        queriedCount?: number
      }
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
      }
      const results = Array.isArray(data.results) ? data.results : []
      const head =
        typeof data.queriedCount === 'number'
          ? [`本批查询 ${data.queriedCount} 条大纲（按创建时间从早到晚）`]
          : []
      setSummaryLines([...head, ...summarizeResults(results)])
      showEphemeralAdminToast(`Draft skeleton 入队完成：新建 ${results.filter((r) => r.created).length} 条`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败')
    } finally {
      setBusy(false)
    }
  }

  const titleId = 'content-brief-draft-skeleton-title'

  return (
    <>
      <Button buttonStyle="secondary" onClick={() => setOpen(true)} type="button">
        入队 Draft skeleton
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
                入队 Draft skeleton
              </h2>
              <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', opacity: 0.85, lineHeight: 1.5 }}>
                按站点批量：选取站点后，按创建时间从早到晚取至多 N 条内容大纲，为每条入队 Draft
                skeleton。完成后请到「工作流任务」执行 Pipeline。若只需某一子集，请先在列表用筛选缩小站点范围再上条数。
                同一大纲若已有 pending/running 的 Draft skeleton 将自动跳过。
              </p>

              <div style={{ marginBottom: '1rem' }}>
                <span style={fieldLabel}>站点</span>
                <div ref={siteComboboxRef} style={{ position: 'relative' }}>
                  <input
                    aria-autocomplete="list"
                    aria-expanded={siteMenuOpen}
                    placeholder={selectedSiteLabel || '搜索站点…'}
                    style={inputStyle}
                    type="text"
                    value={siteMenuOpen ? siteQuery : selectedSiteLabel}
                    onChange={(e) => {
                      setSiteQuery(e.target.value)
                      setSiteMenuOpen(true)
                    }}
                    onFocus={() => {
                      setSiteMenuOpen(true)
                      if (sites.length === 0) void loadSites(siteQuery)
                    }}
                  />
                  {siteMenuOpen ? (
                    <div
                      style={{
                        position: 'absolute',
                        zIndex: 2,
                        left: 0,
                        right: 0,
                        marginTop: 4,
                        maxHeight: 220,
                        overflow: 'auto',
                        borderRadius: 6,
                        border: '1px solid var(--theme-elevation-150)',
                        background: 'var(--theme-elevation-0)',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                      }}
                    >
                      {sitesLoading ? (
                        <div style={{ padding: '0.5rem 0.65rem', fontSize: '0.8125rem' }}>加载中…</div>
                      ) : sites.length === 0 ? (
                        <div style={{ padding: '0.5rem 0.65rem', fontSize: '0.8125rem', opacity: 0.8 }}>
                          无匹配站点
                        </div>
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
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              fontSize: '0.8125rem',
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
                <label style={{ ...fieldLabel, marginTop: '0.75rem' }}>本批条数上限（1–50，默认 25）</label>
                <input
                  inputMode="numeric"
                  style={inputStyle}
                  value={limitInput}
                  onChange={(e) => setLimitInput(e.target.value)}
                />
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', opacity: 0.75 }}>
                  按创建时间从早到晚取该站点下最多 N 条内容大纲并入队。
                </p>
              </div>

              {error ? (
                <p style={{ marginTop: '0.65rem', color: 'var(--theme-error-500)', fontSize: '0.8125rem' }}>
                  {error}
                </p>
              ) : null}
              {summaryLines.length > 0 ? (
                <ul
                  style={{
                    marginTop: '0.65rem',
                    paddingLeft: '1.1rem',
                    fontSize: '0.8125rem',
                    opacity: 0.9,
                  }}
                >
                  {summaryLines.map((m, i) => (
                    <li key={`${i}-${m}`}>{m}</li>
                  ))}
                </ul>
              ) : null}

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                <Button
                  disabled={busy || selectedSiteId == null}
                  onClick={() => void previewSite()}
                  type="button"
                >
                  预览候选
                </Button>
                <Button
                  disabled={busy || selectedSiteId == null}
                  onClick={() => void submitSite()}
                  type="button"
                >
                  入队
                </Button>
                <Button buttonStyle="secondary" disabled={busy} onClick={close} type="button">
                  关闭
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  )
}
