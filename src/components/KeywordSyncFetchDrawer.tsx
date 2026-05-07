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
  tenantId?: number | null
}

type PipelineProfileOption = {
  id: number
  name: string
  slug: string
  isDefault: boolean
}

type DfsRow = {
  term: string
  volume: number
  kd: number
  intent: string
  cpc: number | null
  opportunityScore: number
  eligible: boolean
  eligibilityReason: string
  persistedId?: string | number
  skippedDuplicate?: boolean
  persistError?: string
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

function buildSeedsFromCategories(
  categories: { name?: string | null }[],
  mainProduct: string | null | undefined,
): string {
  const names = categories
    .map((c) => (typeof c.name === 'string' ? c.name.trim() : ''))
    .filter(Boolean)
  const unique: string[] = []
  const seen = new Set<string>()
  for (const n of names) {
    if (seen.has(n)) continue
    seen.add(n)
    unique.push(n)
    if (unique.length >= 5) break
  }
  if (unique.length > 0) return unique.join('\n')
  const mp = typeof mainProduct === 'string' ? mainProduct.trim() : ''
  return mp
}

export function KeywordSyncFetchDrawer(): React.ReactElement {
  const { startKeywordsDfsFetchJob, completeKeywordsDfsFetchJob, failKeywordsDfsFetchJob } =
    useAdminBackgroundActivity()
  const [open, setOpen] = useState(false)
  const [siteQuery, setSiteQuery] = useState('')
  const [sites, setSites] = useState<SiteOption[]>([])
  const [sitesLoading, setSitesLoading] = useState(false)
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null)
  const [selectedSiteLabel, setSelectedSiteLabel] = useState('')
  /** Last picked site row — used for mainProduct fallback when categories list is empty. */
  const [selectedSiteOption, setSelectedSiteOption] = useState<SiteOption | null>(null)
  const [siteMenuOpen, setSiteMenuOpen] = useState(false)
  const siteComboboxRef = useRef<HTMLDivElement>(null)
  const skipSiteQueryDebounceRef = useRef(false)

  const [seedsText, setSeedsText] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [locationCode, setLocationCode] = useState('2840')
  const [languageCode, setLanguageCode] = useState('en')
  const [intentOverride, setIntentOverride] = useState('') // comma-separated e.g. commercial,transactional
  const [minVolume, setMinVolume] = useState('')
  const [maxKd, setMaxKd] = useState('')
  const [minOpportunityScore, setMinOpportunityScore] = useState('')
  const [pullLimit, setPullLimit] = useState('')

  const [error, setError] = useState<string | null>(null)

  const [pipelineProfiles, setPipelineProfiles] = useState<PipelineProfileOption[]>([])
  const [pipelineProfilesLoading, setPipelineProfilesLoading] = useState(false)
  /** When null, server resolves from site / tenant default. */
  const [pipelineProfileId, setPipelineProfileId] = useState<number | null>(null)

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
    setSiteQuery('')
    setSites([])
    setSelectedSiteId(null)
    setSelectedSiteLabel('')
    setSelectedSiteOption(null)
    setSiteMenuOpen(false)
    setError(null)
    setPipelineProfiles([])
    setPipelineProfileId(null)
    setSeedsText('')
  }

  const pickSite = (s: SiteOption): void => {
    setSelectedSiteId(s.id)
    setSelectedSiteOption(s)
    setSelectedSiteLabel(formatSiteLine(s))
    setSiteQuery('')
    setSiteMenuOpen(false)
    setPipelineProfiles([])
    setPipelineProfileId(null)
  }

  useEffect(() => {
    if (selectedSiteId == null) {
      setPipelineProfiles([])
      setPipelineProfileId(null)
      return
    }
    let cancelled = false
    setPipelineProfilesLoading(true)
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/pipeline-profiles/options?siteId=${encodeURIComponent(String(selectedSiteId))}`,
          { credentials: 'include' },
        )
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
          profiles?: PipelineProfileOption[]
        }
        if (!res.ok) {
          if (!cancelled) {
            setPipelineProfiles([])
            setError(typeof data.error === 'string' ? data.error : '加载流水线配置失败')
          }
          return
        }
        if (!cancelled) {
          setPipelineProfiles(Array.isArray(data.profiles) ? data.profiles : [])
        }
      } catch {
        if (!cancelled) {
          setPipelineProfiles([])
          setError('加载流水线配置失败')
        }
      } finally {
        if (!cancelled) setPipelineProfilesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedSiteId])

  useEffect(() => {
    if (selectedSiteId == null) return
    let cancelled = false
    const mainProduct =
      selectedSiteOption != null && selectedSiteOption.id === selectedSiteId
        ? selectedSiteOption.mainProduct
        : undefined
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/article-quick-action/options?siteId=${encodeURIComponent(String(selectedSiteId))}`,
          { credentials: 'include' },
        )
        const data = (await res.json().catch(() => ({}))) as {
          categories?: { name?: string | null }[]
        }
        if (!res.ok) {
          if (!cancelled) setSeedsText(buildSeedsFromCategories([], mainProduct))
          return
        }
        const categories = Array.isArray(data.categories) ? data.categories : []
        if (!cancelled)
          setSeedsText(buildSeedsFromCategories(categories, mainProduct))
      } catch {
        if (!cancelled) setSeedsText(buildSeedsFromCategories([], mainProduct))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedSiteId, selectedSiteOption])

  const parseIntentOverride = (): string[] | undefined => {
    const t = intentOverride.trim()
    if (!t) return undefined
    const parts = t
      .split(/[,，\s]+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
    const allowed = new Set(['informational', 'navigational', 'commercial', 'transactional'])
    const out = parts.filter((p) => allowed.has(p))
    return out.length > 0 ? out : undefined
  }

  const submit = (): void => {
    if (selectedSiteId == null) {
      setError('请选择站点')
      return
    }
    const seedLines = seedsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (seedLines.length === 0) {
      setError('请至少输入一行种子词')
      return
    }
    if (seedLines.length > 5) {
      setError('最多 5 个种子词（每行一个）')
      return
    }

    const loc = Number(locationCode.trim())
    const body: Record<string, unknown> = {
      siteId: selectedSiteId,
      seeds: seedLines,
      ...(Number.isFinite(loc) ? { locationCode: Math.floor(loc) } : {}),
      ...(languageCode.trim() ? { languageCode: languageCode.trim().toLowerCase() } : {}),
    }
    const io = parseIntentOverride()
    if (io) body.intentWhitelist = io
    if (minVolume.trim() !== '' && Number.isFinite(Number(minVolume))) body.minVolume = Number(minVolume)
    if (maxKd.trim() !== '' && Number.isFinite(Number(maxKd))) body.maxKd = Number(maxKd)
    if (minOpportunityScore.trim() !== '' && Number.isFinite(Number(minOpportunityScore))) {
      body.minOpportunityScore = Number(minOpportunityScore)
    }
    if (pullLimit.trim() !== '' && Number.isFinite(Number(pullLimit))) {
      body.pullLimit = Number(pullLimit)
    }
    if (pipelineProfileId != null && Number.isFinite(pipelineProfileId)) {
      body.pipelineProfileId = pipelineProfileId
    }

    setError(null)
    const siteLabelSnap = selectedSiteLabel
    const jobId = startKeywordsDfsFetchJob(
      siteLabelSnap.trim() ? { siteLabel: siteLabelSnap } : {},
    )
    close()

    void (async () => {
      try {
        const res = await fetch('/api/admin/keywords/dfs-fetch', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
          ok?: boolean
          total?: number
          persisted?: number
          skipped?: number
          eligibleCount?: number
          dataForSeoUsdCharged?: number
          rows?: DfsRow[]
        }
        if (!res.ok || data.ok !== true) {
          const errText =
            typeof data.error === 'string'
              ? data.error
              : !res.ok
                ? `请求失败（HTTP ${res.status}）`
                : '请求失败'
          failKeywordsDfsFetchJob({ jobId, message: errText })
          return
        }

        const rows = Array.isArray(data.rows) ? data.rows : []
        const withErr = rows.filter(
          (r): r is DfsRow & { persistError: string } =>
            typeof r?.persistError === 'string' && r.persistError.trim().length > 0,
        )
        const persistErrorCount = withErr.length
        const persistErrorsPreview = withErr.slice(0, 8).map((r) => ({
          term: typeof r.term === 'string' ? r.term : '?',
          message: r.persistError.trim(),
        }))

        completeKeywordsDfsFetchJob({
          jobId,
          summary: {
            total: data.total ?? 0,
            persisted: data.persisted ?? 0,
            skipped: data.skipped ?? 0,
            eligibleCount: data.eligibleCount ?? 0,
            dataForSeoUsdCharged:
              typeof data.dataForSeoUsdCharged === 'number' ? data.dataForSeoUsdCharged : undefined,
            persistErrorCount,
            ...(persistErrorsPreview.length > 0 ? { persistErrorsPreview } : {}),
          },
        })
      } catch (e) {
        failKeywordsDfsFetchJob({
          jobId,
          message: e instanceof Error ? e.message : '请求失败',
        })
      }
    })()
  }

  const titleId = 'keyword-dfs-sync-title'

  return (
    <>
      <Button buttonStyle="secondary" onClick={() => setOpen(true)} size="small" type="button">
        同步拉取 · DFS
      </Button>

      {open ? (
        <div aria-labelledby={titleId} aria-modal role="dialog" style={backdropStyle}>
          <button
            aria-label="关闭"
            style={{
              position: 'absolute',
              inset: 0,
              border: 'none',
              padding: 0,
              margin: 0,
              cursor: 'default',
              background: 'transparent',
            }}
            type="button"
            onClick={close}
          />
          <div style={{ ...panelStyle, position: 'relative', zIndex: 1 }}>
            <h2 id={titleId} style={{ margin: '0 0 0.75rem', fontSize: '1.125rem', fontWeight: 600 }}>
              同步拉取 · DataForSEO（关键词）
            </h2>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', opacity: 0.85, lineHeight: 1.5 }}>
              按站点写入 <code>keywords</code>（status=draft），并按「SEO 流水线」中的 AMZ 资格 JSON 打{' '}
              <code>eligible</code>
              。数据来自 DataForSEO Labs Keyword Suggestions（含 KD / intent）。提交后窗口会立即关闭；进度与摘要见顶栏
              Banner（关键词列表会随刷新更新）。
            </p>

            {error ? (
              <p style={{ color: 'var(--theme-error-500)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
                {error}
              </p>
            ) : null}

            <div ref={siteComboboxRef} style={{ marginBottom: '1rem', position: 'relative' }}>
              <span style={fieldLabel} id="kw-dfs-site-label">
                站点
              </span>
              <button
                aria-expanded={siteMenuOpen}
                aria-haspopup="listbox"
                aria-labelledby="kw-dfs-site-label"
                style={{
                  ...inputStyle,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  width: '100%',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                type="button"
                onClick={() => {
                  setSiteMenuOpen((prev) => {
                    const next = !prev
                    if (next) {
                      skipSiteQueryDebounceRef.current = true
                      void loadSites(siteQuery)
                    }
                    return next
                  })
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    opacity: selectedSiteId == null ? 0.55 : 1,
                  }}
                >
                  {selectedSiteId == null ? '请选择站点' : selectedSiteLabel}
                </span>
                <span aria-hidden style={{ flexShrink: 0, opacity: 0.65, fontSize: '0.65rem' }}>
                  {siteMenuOpen ? '▲' : '▼'}
                </span>
              </button>

              {siteMenuOpen ? (
                <div
                  role="listbox"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: '100%',
                    marginTop: 4,
                    zIndex: 5,
                    borderRadius: 6,
                    border: '1px solid var(--theme-elevation-150)',
                    background: 'var(--theme-elevation-50)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                    padding: '0.5rem',
                    maxHeight: 280,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  <input
                    aria-label="筛选站点"
                    autoComplete="off"
                    placeholder="名称、slug 或域名…"
                    style={inputStyle}
                    type="search"
                    value={siteQuery}
                    onChange={(e) => setSiteQuery(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div style={{ maxHeight: 200, overflow: 'auto', margin: '0 -0.25rem' }}>
                    {sitesLoading ? (
                      <span style={{ fontSize: '0.75rem', opacity: 0.7, padding: '0.25rem 0.5rem' }}>
                        加载中…
                      </span>
                    ) : (
                      sites.map((s) => (
                        <button
                          key={s.id}
                          aria-selected={selectedSiteId === s.id}
                          role="option"
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '0.45rem 0.5rem',
                            border: 'none',
                            borderRadius: 4,
                            background:
                              selectedSiteId === s.id ? 'var(--theme-elevation-100)' : 'transparent',
                            color: 'inherit',
                            cursor: 'pointer',
                            fontSize: '0.8125rem',
                          }}
                          type="button"
                          onClick={() => pickSite(s)}
                        >
                          {formatSiteLine(s)}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="kw-dfs-pipeline-profile" style={fieldLabel}>
                流水线配置（可选）
              </label>
              <select
                id="kw-dfs-pipeline-profile"
                disabled={selectedSiteId == null || pipelineProfilesLoading}
                style={{ ...inputStyle, cursor: selectedSiteId == null ? 'not-allowed' : 'pointer' }}
                value={pipelineProfileId == null ? '' : String(pipelineProfileId)}
                onChange={(e) => {
                  const v = e.target.value
                  setPipelineProfileId(v === '' ? null : Number(v))
                }}
              >
                <option value="">
                  {pipelineProfilesLoading && selectedSiteId != null
                    ? '加载中…'
                    : '使用站点 / 租户默认（resolve）'}
                </option>
                {pipelineProfiles.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                    {p.slug ? ` (${p.slug})` : ''}
                    {p.isDefault ? ' · 租户默认' : ''}
                  </option>
                ))}
              </select>
              {selectedSiteId != null && !pipelineProfilesLoading && pipelineProfiles.length === 0 ? (
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', opacity: 0.7 }}>
                  该租户暂无 pipeline profile，将仅使用全局 pipeline-settings。
                </p>
              ) : null}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <span style={fieldLabel}>种子词（每行一个，最多 5 行）</span>
              <p style={{ margin: '0 0 0.35rem', fontSize: '0.7rem', opacity: 0.65, lineHeight: 1.35 }}>
                选择站点后将按分类名称预填；若无分类则使用站点主品。
              </p>
              <textarea
                placeholder="例如：wireless earbuds"
                rows={4}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 88 }}
                value={seedsText}
                onChange={(e) => setSeedsText(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <button
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontSize: '0.8125rem',
                  padding: 0,
                  textDecoration: 'underline',
                }}
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
              >
                {advancedOpen ? '▼ 收起高级' : '▶ 高级（地区 / 语言 / 阈值覆盖）'}
              </button>
              {advancedOpen ? (
                <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.75rem' }}>
                  <div>
                    <span style={fieldLabel}>location_code（默认 2840 US）</span>
                    <input
                      style={inputStyle}
                      type="text"
                      value={locationCode}
                      onChange={(e) => setLocationCode(e.target.value)}
                    />
                  </div>
                  <div>
                    <span style={fieldLabel}>language_code（默认 en）</span>
                    <input
                      style={inputStyle}
                      type="text"
                      value={languageCode}
                      onChange={(e) => setLanguageCode(e.target.value)}
                    />
                  </div>
                  <div>
                    <span style={fieldLabel}>intent 白名单覆盖（逗号分隔，可空）</span>
                    <input
                      placeholder="commercial, transactional"
                      style={inputStyle}
                      type="text"
                      value={intentOverride}
                      onChange={(e) => setIntentOverride(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <span style={fieldLabel}>minVolume</span>
                      <input
                        inputMode="numeric"
                        placeholder="200"
                        style={inputStyle}
                        type="text"
                        value={minVolume}
                        onChange={(e) => setMinVolume(e.target.value)}
                      />
                    </div>
                    <div>
                      <span style={fieldLabel}>maxKd</span>
                      <input
                        inputMode="numeric"
                        placeholder="60"
                        style={inputStyle}
                        type="text"
                        value={maxKd}
                        onChange={(e) => setMaxKd(e.target.value)}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <span style={fieldLabel}>minOpportunityScore</span>
                      <input
                        inputMode="numeric"
                        placeholder="30"
                        style={inputStyle}
                        type="text"
                        value={minOpportunityScore}
                        onChange={(e) => setMinOpportunityScore(e.target.value)}
                      />
                    </div>
                    <div>
                      <span style={fieldLabel}>pullLimit</span>
                      <input
                        inputMode="numeric"
                        placeholder="200"
                        style={inputStyle}
                        type="text"
                        value={pullLimit}
                        onChange={(e) => setPullLimit(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
              <Button buttonStyle="secondary" onClick={close} type="button">
                关闭
              </Button>
              <Button disabled={selectedSiteId == null} type="button" onClick={submit}>
                同步拉取并标记
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
