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

type OfferOptionRow = {
  id: number
  title: string
  asin: string | null
}

const BATCH_MAX = 40

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
  width: 'min(40rem, 100%)',
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

const titleId = 'quick-action-offer-review-mdx'

export function OfferReviewMdxQuickActionModal(): React.ReactElement {
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

  const [offers, setOffers] = useState<OfferOptionRow[]>([])
  const [offersCap, setOffersCap] = useState(500)
  const [offersLoading, setOffersLoading] = useState(false)
  const [selectedOfferIds, setSelectedOfferIds] = useState<Set<number>>(new Set())

  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [idsText, setIdsText] = useState('')

  const [aiModel, setAiModel] = useState('')
  const [createArticle, setCreateArticle] = useState(true)
  const [locale, setLocale] = useState('en')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [batchStatus, setBatchStatus] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)

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

  const loadOffers = useCallback(async (siteId: number) => {
    setOffersLoading(true)
    setError(null)
    setOffers([])
    try {
      const res = await fetch(
        `/api/admin/offers/review-quick-action-options?siteId=${encodeURIComponent(String(siteId))}`,
        { credentials: 'include' },
      )
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: unknown }
        throw new Error(typeof err.error === 'string' ? err.error : '加载 Offer 失败')
      }
      const data = (await res.json()) as {
        offers?: OfferOptionRow[]
        cap?: number
      }
      setOffers(Array.isArray(data.offers) ? data.offers : [])
      if (typeof data.cap === 'number' && data.cap > 0) setOffersCap(data.cap)
    } catch (e) {
      setOffers([])
      setError(e instanceof Error ? e.message : '加载 Offer 失败')
    } finally {
      setOffersLoading(false)
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
    if (!open) return
    if (selectedSiteId == null) {
      setOffers([])
      setSelectedOfferIds(new Set())
      return
    }
    setSelectedOfferIds(new Set())
    setError(null)
    setSummary(null)
    void loadOffers(selectedSiteId)
  }, [selectedSiteId, open, loadOffers])

  const close = (): void => {
    setOpen(false)
    setSiteQuery('')
    setSites([])
    setSelectedSiteId(null)
    setSelectedSiteLabel('')
    setSiteMenuOpen(false)
    setOffers([])
    setOffersCap(500)
    setSelectedOfferIds(new Set())
    setAdvancedOpen(false)
    setIdsText('')
    setAiModel('')
    setCreateArticle(true)
    setLocale('en')
    setError(null)
    setSummary(null)
    setBatchStatus(null)
    setSubmitting(false)
  }

  const pickSite = (s: SiteOption): void => {
    setSelectedSiteId(s.id)
    setSelectedSiteLabel(formatSiteLine(s))
    setSiteQuery('')
    setSiteMenuOpen(false)
  }

  const parseManualIds = (): number[] => {
    const raw = idsText.replace(/,/g, ' ').split(/\s+/).map((x) => x.trim()).filter(Boolean)
    const nums = raw.map((s) => Number(s)).filter((n) => Number.isFinite(n) && n > 0)
    return Array.from(new Set(nums))
  }

  const toggleOffer = (id: number): void => {
    setSelectedOfferIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllLoaded = (): void => {
    setSelectedOfferIds(new Set(offers.map((o) => o.id)))
  }

  type GenResult = { offerId: number; ok: boolean; error?: string; articleId?: number }

  const submit = async (): Promise<void> => {
    const fromCheckboxes = [...selectedOfferIds]
    const fromManual = advancedOpen ? parseManualIds() : []
    const offerIds = Array.from(new Set([...fromCheckboxes, ...fromManual]))
    if (offerIds.length === 0) {
      setError('请先选择站点并勾选 Offer，或在高级选项中输入 ID。')
      return
    }
    setError(null)
    setSubmitting(true)
    setSummary(null)
    setBatchStatus(null)

    const bodyBase = {
      createArticle,
      locale: locale.trim() || 'en',
      ...(aiModel.trim() ? { aiModel: aiModel.trim() } : {}),
    }

    try {
      const chunks: number[][] = []
      for (let i = 0; i < offerIds.length; i += BATCH_MAX) {
        chunks.push(offerIds.slice(i, i + BATCH_MAX))
      }

      const merged: GenResult[] = []
      let totalOk = 0

      for (let i = 0; i < chunks.length; i++) {
        const batch = chunks[i]
        const batchNo = i + 1
        setBatchStatus(
          chunks.length > 1 ? `批次 ${batchNo} / ${chunks.length}（本批 ${batch.length} 条）…` : null,
        )

        const res = await fetch('/api/admin/offers/generate-review-mdx', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...bodyBase, offerIds: batch }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
          okCount?: number
          total?: number
          results?: GenResult[]
        }
        if (!res.ok) {
          setError(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
          const lines = merged.map((r) =>
            r.ok ? `#${r.offerId} OK${r.articleId != null ? ` article ${r.articleId}` : ''}` : `#${r.offerId} ERR ${r.error ?? ''}`,
          )
          if (lines.length > 0) {
            setSummary(
              `已执行至批次 ${batchNo - 1} / ${chunks.length}，后续中断。\n${totalOk}/${merged.length} OK（已完成）\n${lines.join('\n')}`,
            )
          }
          return
        }

        const batchResults = Array.isArray(data.results) ? data.results : []
        merged.push(...batchResults)
        totalOk += data.okCount ?? batchResults.filter((r) => r.ok).length

        if (chunks.length > 1) {
          const bc = data.okCount ?? batchResults.filter((r) => r.ok).length
          const bt = data.total ?? batchResults.length
          setBatchStatus(`批次 ${batchNo} / ${chunks.length} · 本批 ${bc}/${bt} OK`)
        }
      }

      const lines = merged.map((r) => {
        if (r.ok) {
          return `#${r.offerId} OK${r.articleId != null ? ` article ${r.articleId}` : ''}`
        }
        return `#${r.offerId} ERR ${r.error ?? ''}`
      })
      const okFinal = merged.filter((r) => r.ok).length
      setSummary(`${okFinal}/${merged.length} OK\n${lines.join('\n')}`)
      setBatchStatus(null)
      router.refresh()
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  const atOfferCap = offers.length >= offersCap

  return (
    <>
      <Button buttonStyle="secondary" onClick={() => setOpen(true)} size="small" type="button">
        生成 Review MDX
      </Button>

      {open ?
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
            <h2 id={titleId} style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>
              Generate Review MDX（OpenRouter）
            </h2>
            <p style={{ fontSize: '0.8rem', opacity: 0.85, marginBottom: '1rem' }}>
              选择站点后勾选 Offer（或全选当前列表），写入 Offer · Review MDX 草稿；可选同步创建/更新 draft{' '}
              <code>articles</code>
              （Lexical）。每请求最多 {BATCH_MAX} 条，超出将自动分批。
            </p>

            <div ref={siteComboboxRef} style={{ marginBottom: '1rem', position: 'relative' }}>
              <span style={fieldLabel} id="offer-review-site-label">
                站点
              </span>
              <button
                aria-expanded={siteMenuOpen}
                aria-haspopup="listbox"
                aria-labelledby="offer-review-site-label"
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

            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.85 }}>Offer（多选）</span>
                <Button
                  buttonStyle="secondary"
                  disabled={offers.length === 0 || submitting}
                  size="small"
                  type="button"
                  onClick={() => selectAllLoaded()}
                >
                  全选本站点 Offer
                </Button>
              </div>
              {atOfferCap ?
                <p style={{ fontSize: '0.7rem', opacity: 0.75, margin: '0.25rem 0 0' }}>
                  当前列表最多 {offersCap} 条（按更新时间）；全选仅针对已加载项。
                </p>
              : offers.length > 0 ?
                <p style={{ fontSize: '0.7rem', opacity: 0.65, margin: '0.25rem 0 0' }}>
                  已加载 {offers.length} 条
                </p>
              : null}
              <div
                style={{
                  marginTop: '0.5rem',
                  border: '1px solid var(--theme-elevation-150)',
                  borderRadius: 6,
                  padding: '0.5rem',
                  maxHeight: 240,
                  overflow: 'auto',
                  fontSize: '0.8125rem',
                }}
              >
                {selectedSiteId == null ?
                  <span style={{ opacity: 0.65 }}>先选择站点…</span>
                : offersLoading ?
                  <span style={{ opacity: 0.7 }}>加载 Offer…</span>
                : offers.length === 0 ?
                  <span style={{ opacity: 0.65 }}>该站点下暂无 Offer</span>
                : offers.map((o) => {
                    const asinBit = o.asin ? ` · ASIN ${o.asin}` : ''
                    return (
                      <label
                        key={o.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '0.5rem',
                          padding: '0.35rem 0',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          checked={selectedOfferIds.has(o.id)}
                          type="checkbox"
                          onChange={() => {
                            toggleOffer(o.id)
                          }}
                        />
                        <span>
                          {o.title}
                          <span style={{ opacity: 0.65, display: 'block', fontSize: '0.72rem' }}>
                            #{o.id}
                            {asinBit}
                          </span>
                        </span>
                      </label>
                    )
                  })
                }
              </div>
            </div>

            <button
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                marginBottom: '0.65rem',
                padding: 0,
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
                fontSize: '0.8rem',
                opacity: 0.9,
              }}
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              <span aria-hidden>{advancedOpen ? '▼' : '▶'}</span>
              高级：手动输入 Offer ID（与勾选合并）
            </button>
            {advancedOpen ?
              <>
                <label style={fieldLabel} htmlFor="offer-review-ids">
                  额外 Offer ID
                </label>
                <textarea
                  id="offer-review-ids"
                  style={{ ...inputStyle, minHeight: '3.5rem', fontFamily: 'inherit', marginBottom: '0.75rem' }}
                  value={idsText}
                  onChange={(e) => setIdsText(e.target.value)}
                  placeholder="空格或逗号分隔，例如：12 34 56"
                />
              </>
            : null}

            <div style={{ marginTop: '0.85rem' }}>
              <label style={fieldLabel} htmlFor="offer-review-locale">
                Locale
              </label>
              <input
                id="offer-review-locale"
                style={inputStyle}
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
              />
            </div>

            <div style={{ marginTop: '0.85rem' }}>
              <label style={fieldLabel} htmlFor="offer-review-model">
                OpenRouter 模型（可选）
              </label>
              <input
                id="offer-review-model"
                style={inputStyle}
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder="留空则用 pipeline-settings / 环境变量"
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.85rem' }}>
              <input
                type="checkbox"
                checked={createArticle}
                onChange={(e) => setCreateArticle(e.target.checked)}
              />
              <span style={{ fontSize: '0.875rem' }}>同时创建/更新 Article（draft）</span>
            </label>

            {error ?
              <p style={{ color: 'var(--theme-error-500)', marginTop: '0.75rem', fontSize: '0.875rem' }}>
                {error}
              </p>
            : null}
            {batchStatus ?
              <p style={{ marginTop: '0.5rem', fontSize: '0.8125rem', opacity: 0.85 }}>{batchStatus}</p>
            : null}
            {summary ?
              <pre
                style={{
                  marginTop: '0.75rem',
                  fontSize: '0.75rem',
                  whiteSpace: 'pre-wrap',
                  background: 'var(--theme-elevation-50)',
                  padding: '0.75rem',
                  borderRadius: 4,
                }}
              >
                {summary}
              </pre>
            : null}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
              <Button type="button" buttonStyle="secondary" onClick={close} disabled={submitting}>
                关闭
              </Button>
              <Button type="button" onClick={() => void submit()} disabled={submitting}>
                {submitting ? '执行中…' : '开始'}
              </Button>
            </div>
          </div>
        </div>
      : null}
    </>
  )
}
