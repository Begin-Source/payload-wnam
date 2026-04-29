'use client'

import { Button } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
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
  slotIndex?: number | null
  kind?: 'article' | 'guide' | null
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

const merchantSlotTitleId = 'quick-action-offer-merchant-slot'

export function OfferMerchantSlotQuickActionModal(): React.ReactElement {
  const router = useRouter()
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
  const [catsLoading, setCatsLoading] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(new Set())

  const [fetchLimit, setFetchLimit] = useState(5)
  const [slottedOnly, setSlottedOnly] = useState(true)
  const [force, setForce] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [successPayload, setSuccessPayload] = useState<{
    batchId: string
    offersMarkedRunningTotal: number
    results: {
      categoryId: number
      ok: boolean
      tag?: string
      skipped?: boolean
      error?: string
      offersMarkedRunning?: number
    }[]
  } | null>(null)

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
    setCatsLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/article-quick-action/options?siteId=${encodeURIComponent(String(siteId))}`,
        { credentials: 'include' },
      )
      if (!res.ok) {
        throw new Error('加载分类失败')
      }
      const data = (await res.json()) as { categories?: CategoryOption[] }
      setCategories(data.categories ?? [])
    } catch (e) {
      setCategories([])
      setError(e instanceof Error ? e.message : '加载分类失败')
    } finally {
      setCatsLoading(false)
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
    if (selectedSiteId != null && open) {
      void loadCategories(selectedSiteId)
      setSelectedCategoryIds(new Set())
    }
  }, [selectedSiteId, open, loadCategories])

  const close = (): void => {
    setOpen(false)
    setSiteQuery('')
    setSites([])
    setSelectedSiteId(null)
    setSelectedSiteLabel('')
    setSiteMenuOpen(false)
    setCategories([])
    setSelectedCategoryIds(new Set())
    setFetchLimit(5)
    setSlottedOnly(true)
    setForce(false)
    setError(null)
    setSuccessPayload(null)
    setSubmitting(false)
  }

  const pickSite = (s: SiteOption): void => {
    setSelectedSiteId(s.id)
    setSelectedSiteLabel(formatSiteLine(s))
    setSiteQuery('')
    setSiteMenuOpen(false)
  }

  const filteredCategories =
    slottedOnly ? categories.filter((c) => c.slotIndex != null && c.slotIndex >= 1) : categories

  const submit = async (): Promise<void> => {
    if (selectedSiteId == null) {
      setError('请选择站点')
      return
    }
    const ids = [...selectedCategoryIds]
    if (ids.length === 0) {
      setError('请至少选一个分类')
      return
    }
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch('/api/admin/offers/merchant-slot-fetch', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: selectedSiteId,
          categoryIds: ids,
          fetchAsinLimit: fetchLimit,
          force,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        batchId?: string
        offersMarkedRunningTotal?: number
        results?: {
          categoryId: number
          ok: boolean
          tag?: string
          skipped?: boolean
          error?: string
          offersMarkedRunning?: number
        }[]
      }
      if (!res.ok || data.ok !== true) {
        setError(typeof data.error === 'string' ? data.error : `请求失败（HTTP ${res.status}）`)
        return
      }
      setSuccessPayload({
        batchId: String(data.batchId ?? ''),
        offersMarkedRunningTotal: Number(data.offersMarkedRunningTotal ?? 0) || 0,
        results: Array.isArray(data.results) ? data.results : [],
      })
    } catch {
      setError('网络错误')
      return
    } finally {
      setSubmitting(false)
    }

    if (
      typeof window !== 'undefined' &&
      (window.location.pathname.includes('/collections/offers') ||
        window.location.pathname.includes('/collections/categories'))
    ) {
      router.refresh()
    }
  }

  const finishSuccess = (): void => {
    setSuccessPayload(null)
    close()
    if (
      typeof window !== 'undefined' &&
      (window.location.pathname.includes('/collections/offers') ||
        window.location.pathname.includes('/collections/categories'))
    ) {
      router.refresh()
    }
  }

  const toggleCat = (id: number): void => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <>
      <Button buttonStyle="secondary" onClick={() => setOpen(true)} size="small" type="button">
        Merchant 拉品（槽位）
      </Button>

      {open ?
        <div aria-labelledby={merchantSlotTitleId} aria-modal role="dialog" style={backdropStyle}>
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
            <h2
              id={merchantSlotTitleId}
              style={{ margin: '0 0 0.75rem', fontSize: '1.125rem', fontWeight: 600 }}
            >
              快捷操作 · DataForSEO 分类槽位拉品
            </h2>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', opacity: 0.85, lineHeight: 1.5 }}>
              按类目关键词调用 DataForSEO Merchant Amazon Products，结果 postback 后写入本站 Offer。
              Tag 形如 <code>payload:category:…</code>。
              <strong> 类目进度</strong>在 <strong>分类</strong> 列表的「Merchant 拉品」列；派发成功后，匹配的{' '}
              <strong>Offer</strong> 「槽位拉取」会标为「运行中」（无匹配 Offer 时仍为「代办」）。
            </p>

            {successPayload ?
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.75rem 1rem',
                  borderRadius: 8,
                  border: '1px solid var(--theme-success-500)',
                  background: 'var(--theme-success-50)',
                  color: 'var(--theme-success-700)',
                  fontSize: '0.8125rem',
                  lineHeight: 1.55,
                }}
              >
                <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>派发已完成</p>
                <p style={{ margin: '0 0 0.5rem' }}>
                  批次 <code>{successPayload.batchId}</code> · 已将{' '}
                  <strong>{successPayload.offersMarkedRunningTotal}</strong> 条符合条件的 Offer
                  槽位标为「运行中」。
                </p>
                <p style={{ margin: '0 0 0.5rem' }}>
                  请在 <strong>分类</strong> 列表核对「Merchant 拉品」（running / done / error）；Webhook
                  回填后 Offer 槽位会变为「已完成」等新状态。
                </p>
                <ul style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem' }}>
                  {successPayload.results.map((r, idx) => (
                    <li key={`${r.categoryId}-${idx}`}>
                      类目 #{r.categoryId}
                      {r.skipped ? ' · 已跳过（摘要为 fetched；可勾选「强制」）' : ''}
                      {r.ok && !r.skipped && r.tag ? ` · tag ${r.tag}` : ''}
                      {typeof r.offersMarkedRunning === 'number' && !r.skipped && r.ok ?
                        ` · Offer +${r.offersMarkedRunning}`
                      : ''}
                      {r.error ? ` · ${r.error}` : ''}
                    </li>
                  ))}
                </ul>
                <Button type="button" onClick={() => finishSuccess()}>
                  关闭
                </Button>
              </div>
            : null}

            {successPayload ? null : error ?
              <p
                style={{
                  color: 'var(--theme-error-500)',
                  fontSize: '0.8125rem',
                  marginBottom: '0.75rem',
                }}
              >
                {error}
              </p>
            : null}

            {successPayload ? null : (
              <>
            <div ref={siteComboboxRef} style={{ marginBottom: '1rem', position: 'relative' }}>
              <span style={fieldLabel} id="merchant-slot-site-label">
                站点
              </span>
              <button
                aria-expanded={siteMenuOpen}
                aria-haspopup="listbox"
                aria-labelledby="merchant-slot-site-label"
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

              {siteMenuOpen ?
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
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  <input
                    aria-label="筛选站点"
                    autoComplete="off"
                    placeholder="输入名称、slug 或域名筛选…"
                    style={inputStyle}
                    type="search"
                    value={siteQuery}
                    onChange={(e) => setSiteQuery(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div style={{ maxHeight: 200, overflow: 'auto' }}>
                    {sitesLoading ?
                      <span style={{ fontSize: '0.75rem', opacity: 0.7, padding: '0.25rem 0.5rem' }}>
                        加载中…
                      </span>
                    : sites.map((s) => (
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
                            background: 'transparent',
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
                    }
                  </div>
                </div>
              : null}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <span style={fieldLabel}>每类目 ASIN 上限（1–20）</span>
              <input
                max={20}
                min={1}
                style={inputStyle}
                type="number"
                value={fetchLimit}
                onChange={(e) => setFetchLimit(Math.max(1, Math.min(20, Number(e.target.value) || 5)))}
              />
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.75rem',
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              <input checked={slottedOnly} type="checkbox" onChange={(e) => setSlottedOnly(e.target.checked)} />
              列表仅显示有槽位序号 (1–5) 的分类
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.75rem',
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              <input checked={force} type="checkbox" onChange={(e) => setForce(e.target.checked)} />
              强制（摘要已为 fetched 时也重新派发 DFS）
            </label>

            <div style={{ marginBottom: '1rem' }}>
              <span style={fieldLabel}>分类（可多选）</span>
              <div
                style={{
                  border: '1px solid var(--theme-elevation-150)',
                  borderRadius: 6,
                  padding: '0.5rem',
                  maxHeight: 220,
                  overflow: 'auto',
                  fontSize: '0.8125rem',
                }}
              >
                {selectedSiteId == null ?
                  <span style={{ opacity: 0.65 }}>先选择站点…</span>
                : catsLoading ?
                  <span style={{ opacity: 0.7 }}>加载分类…</span>
                : filteredCategories.length === 0 ?
                  <span style={{ opacity: 0.65 }}>无可用分类（可关闭「仅槽位」再试）</span>
                : filteredCategories.map((c) => (
                    <label
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.25rem 0',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        checked={selectedCategoryIds.has(c.id)}
                        type="checkbox"
                        onChange={() => {
                          toggleCat(c.id)
                        }}
                      />
                      <span>{c.name}</span>
                      {c.slotIndex != null ?
                        <span style={{ opacity: 0.65 }}> · 槽{c.slotIndex}</span>
                      : null}
                    </label>
                  ))
                }
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <Button buttonStyle="secondary" onClick={close} type="button">
                关闭
              </Button>
              <Button
                type="button"
                disabled={submitting || selectedSiteId == null || selectedCategoryIds.size === 0}
                onClick={() => {
                  void submit()
                }}
              >
                {submitting ? '派发中…' : '派发 DFS 任务'}
              </Button>
            </div>
              </>
            )}
          </div>
        </div>
      : null}
    </>
  )
}
