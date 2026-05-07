'use client'

import type { CategoryCoverSyncRowResult } from '@/components/adminBackgroundActivity/AdminBackgroundActivityContext'
import { useAdminBackgroundActivity } from '@/components/adminBackgroundActivity/AdminBackgroundActivityProvider'
import { Button } from '@payloadcms/ui'
import React, { useCallback, useEffect, useRef, useState } from 'react'

type SiteOption = {
  id: number
  name: string
  slug: string
  primaryDomain: string
}

type CategoryOption = {
  id: number
  name: string
  slug: string
}

function formatSiteLine(s: SiteOption): string {
  return `${s.name} (${s.slug}) ${s.primaryDomain}`
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
  width: 'min(34rem, 100%)',
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

const titleId = 'quick-action-category-cover'

function parseCategoryCoverSyncResults(raw: unknown): CategoryCoverSyncRowResult[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: CategoryCoverSyncRowResult[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const id = typeof o.categoryId === 'number' ? o.categoryId : Number(o.categoryId)
    if (!Number.isFinite(id)) continue
    out.push({
      categoryId: Math.floor(id),
      ok: o.ok === true,
      ...(typeof o.name === 'string' ? { name: o.name } : {}),
      ...(typeof o.slug === 'string' ? { slug: o.slug } : {}),
      ...(typeof o.error === 'string' ? { error: o.error } : {}),
      ...(typeof o.message === 'string' ? { message: o.message } : {}),
      ...(typeof o.mediaId === 'number' ? { mediaId: o.mediaId } : {}),
      ...(typeof o.mode === 'string' ? { mode: o.mode } : {}),
    })
  }
  return out.length > 0 ? out : undefined
}

export function CategoryCoverQuickActionModal(): React.ReactElement {
  const { startCategoryCoverJob, completeCategoryCoverJob, failCategoryCoverJob } =
    useAdminBackgroundActivity()
  const [open, setOpen] = useState(false)
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
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)

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

  const loadCategories = useCallback(async (siteId: number) => {
    setCategoriesLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/article-quick-action/options?siteId=${encodeURIComponent(String(siteId))}`,
        { credentials: 'include' },
      )
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: unknown }
        throw new Error(typeof err.error === 'string' ? err.error : '加载分类失败')
      }
      const data = (await res.json()) as { categories: CategoryOption[] }
      setCategories(data.categories ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载分类失败')
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
    if (selectedSiteId == null) {
      setCategories([])
      setSelectedIds([])
      return
    }
    void loadCategories(selectedSiteId)
    setSelectedIds([])
  }, [selectedSiteId, loadCategories])

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
    setSiteMenuOpen(false)
    setCategories([])
    setSelectedIds([])
    setError(null)
  }

  const pickSite = (s: SiteOption): void => {
    setSelectedSiteId(s.id)
    setSelectedSiteLabel(formatSiteLine(s))
    setSiteQuery('')
    setSiteMenuOpen(false)
  }

  const toggle = (id: number): void => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const submit = (): void => {
    if (selectedSiteId == null) {
      setError('请选择站点')
      return
    }
    if (selectedIds.length === 0) {
      setError('请选择至少一个分类')
      return
    }
    if (selectedIds.length > 10) {
      setError('单次最多选择 10 个分类，请分批执行。')
      return
    }
    const siteId = selectedSiteId
    const categoryIds = [...selectedIds]
    const jobId = startCategoryCoverJob({ categoryCount: categoryIds.length })

    close()

    void (async () => {
      try {
        const res = await fetch('/api/admin/categories/generate-cover-sync', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId,
            categoryIds,
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
          okCount?: number
          failCount?: number
          results?: unknown
        }
        if (!res.ok) {
          throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
        }
        const okN = data.okCount ?? 0
        const failN = data.failCount ?? 0
        const rowResults = parseCategoryCoverSyncResults(data.results)
        completeCategoryCoverJob({
          jobId,
          okCount: okN,
          failCount: failN,
          ...(rowResults ? { results: rowResults } : {}),
        })
      } catch (e) {
        failCategoryCoverJob({
          jobId,
          message: e instanceof Error ? e.message : '提交失败',
        })
      }
    })()
  }

  return (
    <>
      <Button buttonStyle="secondary" onClick={() => setOpen(true)} size="small" type="button">
        Together · 分类封面
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
              Together · 分类封面
            </h2>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', opacity: 0.85, lineHeight: 1.55 }}>
              选定站点并勾选分类后，将<strong>在本页一次请求内</strong>调用 Together 生成封面并写回「封面图」。列表{' '}
              <strong>Together 封面</strong> 列会显示运行中 / 已完成 / 错误；开始后<strong>可随时关闭本窗口</strong>
              ，顶部细条提示与同一列可关注进度。需 TOGETHER_API_KEY 与流水线开启 Together 生图；单次最多 10 条，
              耗时随条数增加。
            </p>

            {error ? (
              <p style={{ color: 'var(--theme-error-500)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
                {error}
              </p>
            ) : null}

            <div ref={siteComboboxRef} style={{ marginBottom: '1rem', position: 'relative' }}>
              <span style={fieldLabel}>站点</span>
              <button
                aria-expanded={siteMenuOpen}
                aria-haspopup="listbox"
                style={{
                  ...inputStyle,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
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
                    padding: '0.5rem',
                    maxHeight: 280,
                  }}
                >
                  <input
                    aria-label="筛选站点"
                    autoComplete="off"
                    placeholder="筛选…"
                    style={inputStyle}
                    type="search"
                    value={siteQuery}
                    onChange={(e) => setSiteQuery(e.target.value)}
                  />
                  <div style={{ maxHeight: 200, overflow: 'auto' }}>
                    {sitesLoading ? (
                      <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>加载中…</span>
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
                            background:
                              selectedSiteId === s.id ? 'var(--theme-elevation-100)' : 'transparent',
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
              <span style={fieldLabel}>分类（多选）</span>
              {selectedSiteId == null ? (
                <div style={{ ...inputStyle, opacity: 0.65 }}>请先选择站点</div>
              ) : categoriesLoading ? (
                <div style={inputStyle}>加载中…</div>
              ) : categories.length === 0 ? (
                <div style={{ ...inputStyle, opacity: 0.75 }}>该站点暂无分类</div>
              ) : (
                <div style={{ ...inputStyle, maxHeight: 220, overflow: 'auto', padding: '0.35rem' }}>
                  {categories.map((c) => (
                    <label
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.45rem',
                        padding: '0.25rem 0',
                        fontSize: '0.8125rem',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        checked={selectedIds.includes(c.id)}
                        type="checkbox"
                        onChange={() => toggle(c.id)}
                      />
                      <span>
                        {c.name} <span style={{ opacity: 0.62 }}>({c.slug})</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
              <Button buttonStyle="secondary" onClick={close} type="button">
                关闭
              </Button>
              <Button
                disabled={
                  selectedSiteId == null || selectedIds.length === 0 || selectedIds.length > 10
                }
                onClick={submit}
                type="button"
              >
                生成封面
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
