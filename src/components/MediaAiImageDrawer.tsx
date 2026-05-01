'use client'

import { Button } from '@payloadcms/ui'
import React, { useCallback, useEffect, useRef, useState } from 'react'

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

type SiteOption = {
  id: number
  name: string
  slug: string
  primaryDomain: string
}

type CategoryOption = {
  id: number
  name: string
}

type DocKindApi = 'articles' | 'pages' | 'both'

type PickerRow = {
  id: number
  kind: 'articles' | 'pages'
  title: string
  featuredImageId: number | null
}

function formatSiteLine(s: SiteOption): string {
  return `${s.name} (${s.slug}) ${s.primaryDomain}`
}

function rowKey(r: PickerRow): string {
  return `${r.kind}:${r.id}`
}

function parseIds(text: string): number[] {
  const parts = text.split(/[\s,，;；]+/).map((s) => s.trim())
  const nums: number[] = []
  for (const p of parts) {
    if (!p) continue
    const n = Number(p)
    if (Number.isFinite(n) && n > 0) nums.push(Math.floor(n))
  }
  return [...new Set(nums)]
}

/**
 * Enqueue `media_image_generate` jobs: primary flow picks articles/pages by site/category/search;
 * maps `featuredImage` → media IDs. Advanced pane: paste media IDs.
 */
export function MediaAiImageDrawer(): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)

  const [siteQuery, setSiteQuery] = useState('')
  const [sites, setSites] = useState<SiteOption[]>([])
  const [sitesLoading, setSitesLoading] = useState(false)
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null)
  const [selectedSiteLabel, setSelectedSiteLabel] = useState('')
  const [siteMenuOpen, setSiteMenuOpen] = useState(false)
  const siteComboboxRef = useRef<HTMLDivElement>(null)
  const skipSiteQueryDebounceRef = useRef(false)

  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [categoryId, setCategoryId] = useState<string>('')

  const [docKind, setDocKind] = useState<DocKindApi>('articles')
  const [titleInput, setTitleInput] = useState('')
  const [debouncedTitle, setDebouncedTitle] = useState('')

  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerRows, setPickerRows] = useState<PickerRow[]>([])
  const [pickerTruncated, setPickerTruncated] = useState(false)

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [idsText, setIdsText] = useState('')
  const [advancedSiteFilter, setAdvancedSiteFilter] = useState('')

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
    } catch {
      setSites([])
    } finally {
      setSitesLoading(false)
    }
  }, [])

  const loadCategories = useCallback(async (siteId: number) => {
    setCategoriesLoading(true)
    try {
      const res = await fetch(
        `/api/admin/article-quick-action/options?siteId=${encodeURIComponent(String(siteId))}`,
        { credentials: 'include' },
      )
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: unknown }
        throw new Error(typeof err.error === 'string' ? err.error : '加载分类失败')
      }
      const data = (await res.json()) as {
        categories: { id: number; name: string; slug?: string }[]
      }
      setCategories(
        (data.categories ?? []).map((c) => ({
          id: c.id,
          name: typeof c.name === 'string' ? c.name : String(c.id),
        })),
      )
    } catch {
      setCategories([])
    } finally {
      setCategoriesLoading(false)
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
    const t = window.setTimeout(() => setDebouncedTitle(titleInput.trim()), 350)
    return () => window.clearTimeout(t)
  }, [titleInput])

  useEffect(() => {
    if (!open) return
    if (selectedSiteId == null) {
      setCategories([])
      setCategoryId('')
      return
    }
    void loadCategories(selectedSiteId)
    setCategoryId('')
  }, [open, selectedSiteId, loadCategories])

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

  const loadPicker = useCallback(async () => {
    if (selectedSiteId == null) {
      setPickerRows([])
      setPickerTruncated(false)
      return
    }
    setPickerLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('siteId', String(selectedSiteId))
      params.set('kind', docKind)
      if (categoryId) params.set('categoryId', categoryId)
      if (debouncedTitle) params.set('q', debouncedTitle)
      params.set('limit', '120')

      const res = await fetch(`/api/admin/media/ai-image-picker-docs?${params}`, {
        credentials: 'include',
      })
      const data = (await res.json().catch(() => ({}))) as {
        rows?: PickerRow[]
        truncated?: boolean
        error?: string
      }
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
      }
      setPickerRows(Array.isArray(data.rows) ? data.rows : [])
      setPickerTruncated(Boolean(data.truncated))
      setSelectedKeys(new Set())
    } catch {
      setPickerRows([])
      setPickerTruncated(false)
    } finally {
      setPickerLoading(false)
    }
  }, [selectedSiteId, docKind, categoryId, debouncedTitle])

  useEffect(() => {
    if (!open) return
    void loadPicker()
  }, [open, loadPicker])

  const toggleKey = useCallback((key: string): void => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const selectAllPicker = useCallback(() => {
    setSelectedKeys(new Set(pickerRows.map((r) => rowKey(r))))
  }, [pickerRows])

  const selectNone = useCallback(() => {
    setSelectedKeys(new Set())
  }, [])

  function pickSite(s: SiteOption): void {
    setSelectedSiteId(s.id)
    setSelectedSiteLabel(formatSiteLine(s))
    setSiteQuery('')
    setSiteMenuOpen(false)
  }

  function clearSite(): void {
    setSelectedSiteId(null)
    setSelectedSiteLabel('')
    setSiteQuery('')
    void loadSites('')
  }

  function close(): void {
    setOpen(false)
    setError(null)
    setSummary(null)
    setSiteQuery('')
    setSites([])
    setSelectedSiteId(null)
    setSelectedSiteLabel('')
    setSiteMenuOpen(false)
    setCategories([])
    setCategoryId('')
    setDocKind('articles')
    setTitleInput('')
    setDebouncedTitle('')
    setPickerRows([])
    setPickerTruncated(false)
    setSelectedKeys(new Set())
    setAdvancedOpen(false)
    setIdsText('')
    setAdvancedSiteFilter('')
  }

  async function submit(): Promise<void> {
    const fromAdvanced = parseIds(idsText)
    const fromPickerMedia: number[] = []
    const articleIds: number[] = []
    const pageIds: number[] = []
    for (const r of pickerRows) {
      if (!selectedKeys.has(rowKey(r))) continue
      if (r.featuredImageId != null) {
        fromPickerMedia.push(r.featuredImageId)
      } else if (r.kind === 'pages') {
        pageIds.push(r.id)
      } else {
        articleIds.push(r.id)
      }
    }
    const mediaPlusAdvanced = [...new Set([...fromPickerMedia, ...fromAdvanced])]
    const artIds = [...new Set(articleIds)]
    const pgIds = [...new Set(pageIds)]

    if (mediaPlusAdvanced.length === 0 && artIds.length === 0 && pgIds.length === 0) {
      setError('请勾选文档，或在「高级」中填写至少一个 media ID')
      return
    }

    if (selectedSiteId == null && (selectedKeys.size > 0 || artIds.length > 0 || pgIds.length > 0)) {
      setError('通过列表勾选时请先选择站点')
      return
    }

    let sitePayload: number | undefined
    if (selectedSiteId != null) {
      sitePayload = selectedSiteId
    } else if (advancedSiteFilter.trim()) {
      const n = Number(advancedSiteFilter.trim())
      if (!Number.isFinite(n)) {
        setError('高级 · 站点 ID 须为数字')
        return
      }
      sitePayload = n
    }

    if (mediaPlusAdvanced.length + artIds.length + pgIds.length > 0 && sitePayload == null) {
      setError('请选择站点，或在高级中填写站点 ID')
      return
    }

    setBusy(true)
    setError(null)
    setSummary(null)
    try {
      const bodyPayload: Record<string, unknown> = {
        ...(sitePayload != null ? { siteId: sitePayload } : {}),
      }
      if (mediaPlusAdvanced.length > 0) bodyPayload.mediaIds = mediaPlusAdvanced
      if (artIds.length > 0) bodyPayload.articleIds = artIds
      if (pgIds.length > 0) bodyPayload.pageIds = pgIds

      const q = await fetch('/api/admin/media/queue-ai-image', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      })
      const body = (await q.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        queuedCount?: number
        queuedMediaIds?: number[]
        queuedArticleIds?: number[]
        queuedPageIds?: number[]
        skipped?: Array<{ kind?: string; id: number; reason: string }>
        capped?: boolean
      }
      if (!q.ok || body.ok === false) {
        throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${q.status}`)
      }
      const lines: string[] = []
      lines.push(
        `已入队 ${body.queuedCount ?? 0} 条 · 请在「工作流任务」里点「执行排队任务 · Pipeline」`,
      )
      if (body.capped) {
        lines.push('（单次至多 50 条，已截断）')
      }
      const qm = body.queuedMediaIds ?? []
      const qa = body.queuedArticleIds ?? []
      const qp = body.queuedPageIds ?? []
      if (qm.length > 0) lines.push(`Media: ${qm.join(', ')}`)
      if (qa.length > 0) lines.push(`文章 ID: ${qa.join(', ')}`)
      if (qp.length > 0) lines.push(`页面 ID: ${qp.join(', ')}`)
      if (Array.isArray(body.skipped) && body.skipped.length > 0) {
        lines.push(
          `跳过 ${body.skipped.length}：${body.skipped.map((x) => `#${x.id} (${String(x.kind ?? '?')}:${x.reason})`).join('；')}`,
        )
      }
      setSummary(lines.join('\n'))
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败')
    } finally {
      setBusy(false)
    }
  }

  const titleId = 'media-ai-image-drawer-title'

  return (
    <>
      <Button buttonStyle="secondary" onClick={() => setOpen(true)} type="button">
        Together 配图 · 媒体库
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
                Together + R2 生成 / 替换媒体文件
              </h2>
              <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', opacity: 0.85, lineHeight: 1.5 }}>
                选站点 → 分类（可选「全部」）→ 搜索标题 → 勾选文章或页面。有配图则替换该 media；无配图将 Together
                出图、新建 media 并写回 featured image。多条文档共用同一 media 时自动去重。需 TOGETHER_API_KEY；高级模式可追加
                media ID。
              </p>

              <div style={{ marginBottom: '1rem' }}>
                <span style={fieldLabel}>文档类型</span>
                <select
                  aria-label="文档类型"
                  style={inputStyle}
                  value={docKind}
                  onChange={(e) => setDocKind(e.target.value as DocKindApi)}
                >
                  <option value="articles">仅文章</option>
                  <option value="pages">仅页面</option>
                  <option value="both">文章 + 页面</option>
                </select>
              </div>

              <div ref={siteComboboxRef} style={{ marginBottom: '1rem', position: 'relative' }}>
                <span style={fieldLabel}>站点（可搜索）</span>
                <button
                  aria-expanded={siteMenuOpen}
                  aria-haspopup="listbox"
                  style={{
                    ...inputStyle,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
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
                {selectedSiteId != null ? (
                  <div style={{ marginTop: '0.35rem' }}>
                    <Button buttonStyle="secondary" size="small" type="button" onClick={() => clearSite()}>
                      清除站点
                    </Button>
                  </div>
                ) : null}
                {siteMenuOpen ? (
                  <div
                    role="listbox"
                    style={{
                      position: 'absolute',
                      zIndex: 2,
                      left: 0,
                      right: 0,
                      marginTop: 4,
                      maxHeight: '14rem',
                      overflow: 'auto',
                      borderRadius: 6,
                      border: '1px solid var(--theme-elevation-150)',
                      background: 'var(--theme-elevation-0)',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                      padding: '0.35rem',
                    }}
                  >
                    <input
                      aria-label="搜索站点"
                      placeholder="按名称 / 域名搜索"
                      style={{ ...inputStyle, marginBottom: '0.35rem' }}
                      value={siteQuery}
                      onChange={(e) => setSiteQuery(e.target.value)}
                    />
                    {sitesLoading ? (
                      <div style={{ fontSize: '0.8125rem', opacity: 0.8, padding: '0.35rem' }}>加载中…</div>
                    ) : sites.length === 0 ? (
                      <div style={{ fontSize: '0.8125rem', opacity: 0.8, padding: '0.35rem' }}>
                        无匹配站点
                      </div>
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
                            padding: '0.4rem 0.5rem',
                            borderRadius: 4,
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

              <div style={{ marginBottom: '1rem' }}>
                <span style={fieldLabel}>分类（可选）</span>
                <select
                  aria-label="分类"
                  disabled={selectedSiteId == null || categoriesLoading}
                  style={{ ...inputStyle, opacity: selectedSiteId == null ? 0.6 : 1 }}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">全部（不按分类筛选）</option>
                  {categories.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <span style={fieldLabel}>标题搜索</span>
                <input
                  aria-label="标题搜索"
                  placeholder="防抖约 350ms 后刷新列表"
                  style={inputStyle}
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  disabled={selectedSiteId == null}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                }}
              >
                <Button
                  buttonStyle="secondary"
                  disabled={pickerRows.length === 0 || selectedSiteId == null}
                  size="small"
                  type="button"
                  onClick={() => selectAllPicker()}
                >
                  全选当前列表
                </Button>
                <Button
                  buttonStyle="secondary"
                  disabled={selectedKeys.size === 0}
                  size="small"
                  type="button"
                  onClick={selectNone}
                >
                  取消全选
                </Button>
                {pickerLoading ? (
                  <span style={{ fontSize: '0.8125rem', opacity: 0.75 }}>加载列表…</span>
                ) : null}
              </div>
              {pickerTruncated ? (
                <p style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: '0.5rem' }}>
                  仅显示本批最多 120 条（可能还有更多）；请缩小搜索或使用高级填 ID。
                </p>
              ) : null}

              <div
                style={{
                  border: '1px solid var(--theme-elevation-150)',
                  borderRadius: 6,
                  maxHeight: '14rem',
                  overflow: 'auto',
                  marginBottom: '1rem',
                }}
              >
                {selectedSiteId == null ? (
                  <div style={{ padding: '0.65rem', fontSize: '0.8125rem', opacity: 0.65 }}>
                    先选择站点后再加载文档列表
                  </div>
                ) : pickerRows.length === 0 && !pickerLoading ? (
                  <div style={{ padding: '0.65rem', fontSize: '0.8125rem', opacity: 0.65 }}>暂无结果</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--theme-elevation-50)' }}>
                        <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem', width: '2rem' }} />
                        <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem' }}>标题</th>
                        <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem', width: '6rem' }}>类型</th>
                        <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem', width: '7rem' }}>Media</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pickerRows.map((r) => {
                        const key = rowKey(r)
                        const sel = selectedKeys.has(key)
                        return (
                          <tr
                            key={key}
                            style={{
                              background: sel ? 'var(--theme-success-50, rgba(34,197,94,0.08))' : undefined,
                            }}
                          >
                            <td style={{ padding: '0.25rem 0.5rem' }}>
                              <input
                                aria-label={`选择 ${r.title}`}
                                type="checkbox"
                                checked={sel}
                                onChange={() => toggleKey(key)}
                              />
                            </td>
                            <td style={{ padding: '0.25rem 0.5rem' }}>{r.title || `#${r.id}`}</td>
                            <td style={{ padding: '0.25rem 0.5rem' }}>
                              {r.kind === 'pages' ? '页面' : '文章'}
                            </td>
                            <td style={{ padding: '0.25rem 0.5rem' }}>
                              {r.featuredImageId != null ? (
                                String(r.featuredImageId)
                              ) : (
                                <span title="流水线将新建 media 并挂载为配图">无配图</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    textDecoration: 'underline',
                    color: 'inherit',
                  }}
                  onClick={() => setAdvancedOpen((v) => !v)}
                >
                  {advancedOpen ? '隐藏「高级：直接填 media ID」' : '显示「高级：直接填 media ID」'}
                </button>
              </div>

              {advancedOpen ? (
                <div style={{ marginBottom: '1rem', paddingTop: '0.25rem' }}>
                  <label style={{ ...fieldLabel, marginBottom: 6 }}>Media ID（与上方勾选合并去重）</label>
                  <textarea
                    aria-label="Media ID 列表"
                    placeholder="每行一个或逗号分隔"
                    style={{ ...inputStyle, minHeight: '5rem', resize: 'vertical' }}
                    value={idsText}
                    onChange={(e) => setIdsText(e.target.value)}
                  />
                  <label style={{ ...fieldLabel, marginTop: '0.65rem', marginBottom: 6 }}>
                    站点 ID（无列表站点时用；与列表同批时以已选站点为准）
                  </label>
                  <input
                    aria-label="高级站点过滤"
                    inputMode="numeric"
                    placeholder="仅高级手填 media 时必填之一"
                    style={inputStyle}
                    value={advancedSiteFilter}
                    onChange={(e) => setAdvancedSiteFilter(e.target.value)}
                  />
                </div>
              ) : null}

              {error ? (
                <p style={{ marginTop: '0.35rem', color: 'var(--theme-error-500)', fontSize: '0.8125rem' }}>
                  {error}
                </p>
              ) : null}
              {summary ? (
                <p
                  style={{
                    marginTop: '0.35rem',
                    fontSize: '0.8125rem',
                    opacity: 0.92,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {summary}
                </p>
              ) : null}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                <Button disabled={busy} onClick={() => void submit()} type="button">
                  入队生成
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
