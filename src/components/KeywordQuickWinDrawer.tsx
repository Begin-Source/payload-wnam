'use client'

import { Button } from '@payloadcms/ui'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { DEFAULT_QUICK_WIN_FILTER } from '@/utilities/quickWinFilter'

type SiteOption = {
  id: number
  name: string
  slug: string
  primaryDomain: string
  mainProduct?: string | null
}

type ClusterRow = {
  pillarId: number
  pillarTerm: string
  memberTerms: string[]
  serpOverlap: number
}

type BatchResp = {
  ok?: boolean
  error?: string
  mode?: string
  dryRun?: boolean
  enqueued?: number
  skipped?: number
  pickedTerms?: string[]
  pickedIds?: number[]
  errorsSample?: string[]
  appliedFilter?: Record<string, unknown>
  limit?: number
  clusters?: ClusterRow[]
  totalDfsCalls?: number
  clusterBeforeEnqueue?: boolean
  clusterMinOverlap?: number
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

/** Keywords list: quick-win filter → `brief_generate` jobs (SERP-aware brief at tick). */
export function KeywordQuickWinDrawer(): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [siteQuery, setSiteQuery] = useState('')
  const [sites, setSites] = useState<SiteOption[]>([])
  const [sitesLoading, setSitesLoading] = useState(false)
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null)
  const [selectedSiteLabel, setSelectedSiteLabel] = useState('')
  const [siteMenuOpen, setSiteMenuOpen] = useState(false)
  const siteComboboxRef = useRef<HTMLDivElement>(null)

  const [eligibleOnly, setEligibleOnly] = useState(DEFAULT_QUICK_WIN_FILTER.eligibleOnly)
  const [intentText, setIntentText] = useState(DEFAULT_QUICK_WIN_FILTER.intentWhitelist.join(', '))
  const [minVolume, setMinVolume] = useState(String(DEFAULT_QUICK_WIN_FILTER.minVolume))
  const [maxVolume, setMaxVolume] = useState(String(DEFAULT_QUICK_WIN_FILTER.maxVolume))
  const [maxKd, setMaxKd] = useState(String(DEFAULT_QUICK_WIN_FILTER.maxKd))
  const [maxPick, setMaxPick] = useState(String(DEFAULT_QUICK_WIN_FILTER.maxPick))
  const [enqueueLimit, setEnqueueLimit] = useState('')

  const [clusterBeforeEnqueue, setClusterBeforeEnqueue] = useState(true)
  const [clusterMinOverlap, setClusterMinOverlap] = useState('3')

  const [preview, setPreview] = useState<{
    terms: string[]
    limit: number
    clusters?: ClusterRow[]
    totalDfsCalls?: number
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<string | null>(null)

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

  const close = (): void => {
    setOpen(false)
    setPreview(null)
    setLastResult(null)
    setError(null)
  }

  const pickSite = (s: SiteOption): void => {
    setSelectedSiteId(s.id)
    setSelectedSiteLabel(formatSiteLine(s))
    setSiteQuery('')
    setSiteMenuOpen(false)
    setPreview(null)
  }

  function buildFilterPayload(): {
    eligibleOnly: boolean
    intentWhitelist: string[]
    minVolume: number
    maxVolume: number
    maxKd: number
    maxPick: number
  } {
    const intents = intentText
      .split(/[,，\s]+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
    const allowed = new Set(['informational', 'navigational', 'commercial', 'transactional'])
    const intentWhitelist = intents.filter((x) => allowed.has(x))
    return {
      eligibleOnly,
      intentWhitelist:
        intentWhitelist.length > 0 ? intentWhitelist : [...DEFAULT_QUICK_WIN_FILTER.intentWhitelist],
      minVolume: Math.max(0, parseInt(minVolume, 10) || DEFAULT_QUICK_WIN_FILTER.minVolume),
      maxVolume: Math.max(0, parseInt(maxVolume, 10) || DEFAULT_QUICK_WIN_FILTER.maxVolume),
      maxKd: Math.min(100, Math.max(0, parseInt(maxKd, 10) || DEFAULT_QUICK_WIN_FILTER.maxKd)),
      maxPick: Math.min(100, Math.max(1, parseInt(maxPick, 10) || DEFAULT_QUICK_WIN_FILTER.maxPick)),
    }
  }

  async function postBatch(dryRun: boolean): Promise<void> {
    if (selectedSiteId == null) {
      setError('请选择站点')
      return
    }
    setSubmitting(true)
    setError(null)
    if (!dryRun) setLastResult(null)
    try {
      const lim = enqueueLimit.trim()
      let limit: number | undefined
      if (lim !== '') {
        const n = Number(lim)
        if (!Number.isFinite(n) || n < 1) {
          setError('本批上限须为 ≥1 的整数，或留空使用服务端默认')
          setSubmitting(false)
          return
        }
        limit = Math.min(100, Math.floor(n))
      }

      const mo = Number.parseInt(clusterMinOverlap, 10)
      if (!Number.isFinite(mo) || mo < 2 || mo > 6) {
        setError('SERP 重叠阈值须为 2–6 的整数')
        setSubmitting(false)
        return
      }

      const res = await fetch('/api/admin/articles/batch-enqueue', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: selectedSiteId,
          mode: 'quick_wins',
          dryRun,
          clusterBeforeEnqueue,
          clusterMinOverlap: mo,
          filter: buildFilterPayload(),
          ...(limit != null ? { limit } : {}),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as BatchResp
      if (!res.ok || data.ok === false) {
        throw new Error(typeof data.error === 'string' ? data.error : '请求失败')
      }

      const terms = data.pickedTerms ?? []
      const clusterRows =
        data.clusters?.map((c) => ({
          pillarId: c.pillarId,
          pillarTerm: c.pillarTerm,
          memberTerms: c.memberTerms,
          serpOverlap: c.serpOverlap,
        })) ?? undefined
      if (dryRun) {
        setPreview({
          terms,
          limit: data.limit ?? terms.length,
          ...(clusterRows != null ? { clusters: clusterRows } : {}),
          ...(typeof data.totalDfsCalls === 'number' ? { totalDfsCalls: data.totalDfsCalls } : {}),
        })
      } else {
        setPreview(null)
        const extra =
          (data.enqueued === 0 && (data.errorsSample?.length ?? 0) > 0
            ? ` · ${(data.errorsSample ?? []).join(' ')}`
            : '') ?? ''
        const dfs =
          typeof data.totalDfsCalls === 'number' ? ` · SERP API 调用 ${data.totalDfsCalls} 次` : ''
        setLastResult(
          `已入队 brief_generate ${data.enqueued ?? 0} 条 · 跳过 ${data.skipped ?? 0}${dfs}${extra}`,
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败')
      if (dryRun) setPreview(null)
    } finally {
      setSubmitting(false)
    }
  }

  const titleId = 'keyword-quick-win-title'

  return (
    <>
      <Button buttonStyle="secondary" onClick={() => setOpen(true)} type="button">
        精选 Quick-win 入队 · Brief
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
                精选 Quick-win → Brief 排产
              </h2>
              <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', opacity: 0.85, lineHeight: 1.5 }}>
                按 eligible / 搜索量区间 / KD / intent 过滤长尾词，并入队 <code>brief_generate</code>
                ；执行 <code>/api/pipeline/tick</code> 时用 Tavily + Google SERP top10 生成 Brief。
              </p>

              {error ? (
                <p style={{ color: 'var(--theme-error-500)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
                  {error}
                </p>
              ) : null}

              {lastResult ? (
                <p style={{ fontSize: '0.8125rem', marginBottom: '0.75rem', opacity: 0.9 }}>{lastResult}</p>
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

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={eligibleOnly}
                  onChange={(e) => setEligibleOnly(e.target.checked)}
                />
                <span style={{ fontSize: '0.8125rem' }}>仅 eligible 关键词</span>
              </label>

              <div style={{ marginBottom: '0.75rem' }}>
                <label style={fieldLabel}>意图（逗号分隔）</label>
                <input
                  style={inputStyle}
                  value={intentText}
                  onChange={(e) => setIntentText(e.target.value)}
                  placeholder="commercial, transactional"
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.65rem',
                  marginBottom: '0.75rem',
                }}
              >
                <div>
                  <label style={fieldLabel}>最小 Volume</label>
                  <input
                    style={inputStyle}
                    inputMode="numeric"
                    value={minVolume}
                    onChange={(e) => setMinVolume(e.target.value)}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>最大 Volume</label>
                  <input
                    style={inputStyle}
                    inputMode="numeric"
                    value={maxVolume}
                    onChange={(e) => setMaxVolume(e.target.value)}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>最大 KD（含）</label>
                  <input
                    style={inputStyle}
                    inputMode="numeric"
                    value={maxKd}
                    onChange={(e) => setMaxKd(e.target.value)}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>单次 maxPick（服务端默认上限）</label>
                  <input
                    style={inputStyle}
                    inputMode="numeric"
                    value={maxPick}
                    onChange={(e) => setMaxPick(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={fieldLabel}>本批入队上限（可选，覆盖默认）</label>
                <input
                  style={inputStyle}
                  inputMode="numeric"
                  value={enqueueLimit}
                  onChange={(e) => setEnqueueLimit(e.target.value)}
                  placeholder="留空 = min(maxPick, 周×日更上限)"
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={clusterBeforeEnqueue}
                  onChange={(e) => setClusterBeforeEnqueue(e.target.checked)}
                />
                <span style={{ fontSize: '0.8125rem' }}>入队前 SERP 聚类（仅 pillar 入队，推荐）</span>
              </label>

              <div style={{ marginBottom: '1rem' }}>
                <label style={fieldLabel}>SERP 有机结果重叠阈值（2–6，默认 3）</label>
                <input
                  style={{ ...inputStyle, maxWidth: '6rem' }}
                  inputMode="numeric"
                  min={2}
                  max={6}
                  value={clusterMinOverlap}
                  onChange={(e) => setClusterMinOverlap(e.target.value)}
                  disabled={!clusterBeforeEnqueue}
                />
              </div>

              {preview && preview.terms.length > 0 ? (
                <div
                  style={{
                    marginBottom: '1rem',
                    padding: '0.65rem',
                    borderRadius: 4,
                    background: 'var(--theme-elevation-50)',
                    fontSize: '0.75rem',
                    maxHeight: '12rem',
                    overflow: 'auto',
                  }}
                >
                  <strong>预览 · 将入队的 pillar 词</strong>（最多 {preview.limit} 条，跳过已有 brief）：
                  <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem' }}>
                    {preview.terms.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                  {typeof preview.totalDfsCalls === 'number' ? (
                    <p style={{ margin: '0.5rem 0 0', opacity: 0.9 }}>
                      本批 SERP（DataForSEO）请求约 <strong>{preview.totalDfsCalls}</strong> 次（7 日内快照会复用）。
                    </p>
                  ) : null}
                </div>
              ) : preview && preview.terms.length === 0 ? (
                <p style={{ fontSize: '0.8125rem', marginBottom: '1rem', opacity: 0.85 }}>无匹配候选。</p>
              ) : null}

              {preview && preview.clusters && preview.clusters.length > 0 ? (
                <div
                  style={{
                    marginBottom: '1rem',
                    overflowX: 'auto',
                    fontSize: '0.72rem',
                    borderRadius: 4,
                    border: '1px solid var(--theme-elevation-150)',
                    padding: '0.5rem',
                  }}
                >
                  <strong style={{ fontSize: '0.75rem' }}>簇详情</strong>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.35rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--theme-elevation-150)' }}>
                        <th style={{ textAlign: 'left', padding: '0.25rem' }}>Pillar</th>
                        <th style={{ textAlign: 'left', padding: '0.25rem' }}>成员</th>
                        <th style={{ textAlign: 'left', padding: '0.25rem' }}>重叠</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.clusters.map((c) => (
                        <tr key={c.pillarId} style={{ borderBottom: '1px solid var(--theme-elevation-100)' }}>
                          <td style={{ padding: '0.25rem', verticalAlign: 'top' }}>{c.pillarTerm}</td>
                          <td style={{ padding: '0.25rem' }}>{c.memberTerms.join(' · ')}</td>
                          <td style={{ padding: '0.25rem' }}>{c.serpOverlap}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Button disabled={submitting} onClick={() => void postBatch(true)} type="button">
                  预览候选
                </Button>
                <Button buttonStyle="secondary" disabled={submitting} onClick={close} type="button">
                  关闭
                </Button>
                <Button disabled={submitting} onClick={() => void postBatch(false)} type="button">
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
