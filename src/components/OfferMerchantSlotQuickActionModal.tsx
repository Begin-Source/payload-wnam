'use client'

import type { MerchantSlotDispatchRowResult } from '@/components/adminBackgroundActivity/AdminBackgroundActivityContext'
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
  slotIndex?: number | null
  kind?: 'article' | 'guide' | 'review' | null
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

function parseMerchantSlotDispatchResults(
  raw: unknown,
): MerchantSlotDispatchRowResult[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: MerchantSlotDispatchRowResult[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const cid = typeof o.categoryId === 'number' ? o.categoryId : Number(o.categoryId)
    if (!Number.isFinite(cid)) continue
    out.push({
      categoryId: Math.floor(cid),
      ok: o.ok === true,
      ...(o.skipped === true ? { skipped: true } : {}),
      ...(typeof o.tag === 'string' ? { tag: o.tag } : {}),
      ...(typeof o.error === 'string' ? { error: o.error } : {}),
      ...(typeof o.offersMarkedRunning === 'number' ? { offersMarkedRunning: o.offersMarkedRunning } : {}),
    })
  }
  return out.length > 0 ? out : undefined
}

const POLL_INTERVAL_MS = 2000
/** 等待 DataForSEO postback Webhook 将 Offer 写入；本地无公网时需隧道否则将超时失败 */
const WRITE_BACK_TIMEOUT_MS = 15 * 60 * 1000

type DispatchStatusCategoryRow = {
  categoryId: number
  merchantOfferFetchWorkflowStatus: string | null
  batchMatches: boolean
  logSnippet?: string
}

async function fetchMerchantDispatchStatuses(args: {
  siteId: number
  batchId: string
  categoryIds: number[]
}): Promise<DispatchStatusCategoryRow[]> {
  const { siteId, batchId, categoryIds } = args
  const qs = new URLSearchParams({
    siteId: String(siteId),
    batchId,
    categoryIds: categoryIds.join(','),
  })
  const res = await fetch(`/api/admin/offers/merchant-slot-dispatch-status?${qs}`, {
    credentials: 'include',
  })
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    categories?: DispatchStatusCategoryRow[]
    error?: string
  }
  if (!res.ok || data.ok !== true || !Array.isArray(data.categories)) {
    throw new Error(typeof data.error === 'string' ? data.error : `状态请求失败（HTTP ${res.status}）`)
  }
  return data.categories
}

async function pollUntilOfferWriteback(args: {
  siteId: number
  batchId: string
  categoryIds: number[]
}): Promise<Map<number, { ok: boolean; error?: string }>> {
  const { siteId, batchId, categoryIds } = args
  const settled = new Map<number, { ok: boolean; error?: string }>()
  if (categoryIds.length === 0) return settled

  const pending = new Set(categoryIds)
  const started = Date.now()

  while (pending.size > 0) {
    if (Date.now() - started >= WRITE_BACK_TIMEOUT_MS) break

    let rows: DispatchStatusCategoryRow[]
    try {
      rows = await fetchMerchantDispatchStatuses({ siteId, batchId, categoryIds })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      for (const id of pending) {
        settled.set(id, { ok: false, error: msg })
      }
      pending.clear()
      break
    }

    for (const id of [...pending]) {
      const row = rows.find((c) => c.categoryId === id)
      if (!row) {
        settled.set(id, { ok: false, error: '状态响应缺行' })
        pending.delete(id)
        continue
      }

      if (!row.batchMatches) {
        settled.set(id, {
          ok: false,
          error:
            row.logSnippet?.trim() || '类目「拉品」批次已变更（可能被新派发覆盖），无法确认本次写入',
        })
        pending.delete(id)
        continue
      }

      const st = (row.merchantOfferFetchWorkflowStatus ?? '').trim().toLowerCase()
      if (st === 'done') {
        settled.set(id, { ok: true })
        pending.delete(id)
        continue
      }
      if (st === 'error') {
        settled.set(id, {
          ok: false,
          error: row.logSnippet?.trim() || '类目侧标记为错误',
        })
        pending.delete(id)
        continue
      }
    }

    if (pending.size === 0) break
    await new Promise((r) => {
      window.setTimeout(r, POLL_INTERVAL_MS)
    })
  }

  for (const id of pending) {
    settled.set(id, {
      ok: false,
      error: `等待 Webhook 写入超时（${Math.round(WRITE_BACK_TIMEOUT_MS / 60000)} 分钟内未完成）`,
    })
  }

  return settled
}

function mergeDispatchRowsWithWriteback(
  dispatchRows: MerchantSlotDispatchRowResult[],
  writeback: Map<number, { ok: boolean; error?: string }>,
): MerchantSlotDispatchRowResult[] {
  return dispatchRows.map((r) => {
    if (!r.ok) return r
    if (r.skipped) {
      return {
        ...r,
        writebackNote: '无需 Webhook（派发已跳过）',
      }
    }
    const w = writeback.get(r.categoryId)
    if (!w) {
      return {
        ...r,
        ok: false,
        error: '缺少 Webhook 写入结果',
      }
    }
    if (w.ok) {
      return {
        ...r,
        writebackNote: 'Offer 已通过 Webhook 写入',
      }
    }
    return {
      ...r,
      ok: false,
      error: w.error ?? 'Webhook 写入失败',
    }
  })
}

export function OfferMerchantSlotQuickActionModal(): React.ReactElement {
  const {
    startMerchantSlotDispatchJob,
    completeMerchantSlotDispatchJob,
    failMerchantSlotDispatchJob,
  } = useAdminBackgroundActivity()
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
  }

  const pickSite = (s: SiteOption): void => {
    setSelectedSiteId(s.id)
    setSelectedSiteLabel(formatSiteLine(s))
    setSiteQuery('')
    setSiteMenuOpen(false)
  }

  const filteredCategories =
    slottedOnly ? categories.filter((c) => c.slotIndex != null && c.slotIndex >= 1) : categories

  const submit = (): void => {
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

    const siteId = selectedSiteId
    const siteLabelSnap = selectedSiteLabel
    const jobId = startMerchantSlotDispatchJob({
      categoryCount: ids.length,
      ...(siteLabelSnap.trim() ? { siteLabel: siteLabelSnap } : {}),
    })
    close()

    void (async () => {
      try {
        const res = await fetch('/api/admin/offers/merchant-slot-fetch', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId,
            categoryIds: ids,
            fetchAsinLimit: fetchLimit,
            force,
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
          batchId?: unknown
          results?: unknown
        }
        if (!res.ok || data.ok !== true) {
          failMerchantSlotDispatchJob({
            jobId,
            message:
              typeof data.error === 'string' ? data.error : `请求失败（HTTP ${res.status}）`,
          })
          return
        }

        const rowResults = parseMerchantSlotDispatchResults(data.results) ?? []

        const batchRaw = data.batchId
        const batchId =
          typeof batchRaw === 'string'
            ? batchRaw
            : batchRaw != null && String(batchRaw).trim()
              ? String(batchRaw)
              : undefined

        const idsToPoll = rowResults.filter((r) => r.ok && !r.skipped).map((r) => r.categoryId)
        if (idsToPoll.length > 0 && !batchId?.trim()) {
          failMerchantSlotDispatchJob({
            jobId,
            message: '服务端未返回批次 ID，无法确认 Offer 写入进度',
          })
          return
        }

        let writeMap = new Map<number, { ok: boolean; error?: string }>()
        if (idsToPoll.length > 0 && batchId?.trim()) {
          writeMap = await pollUntilOfferWriteback({
            siteId,
            batchId: batchId.trim(),
            categoryIds: idsToPoll,
          })
        }

        const merged = mergeDispatchRowsWithWriteback(rowResults, writeMap)
        const okCount = merged.filter((r) => r.ok).length
        const failCount = merged.filter((r) => !r.ok).length

        completeMerchantSlotDispatchJob({
          jobId,
          okCount,
          failCount,
          ...(batchId?.trim() ? { batchId: batchId.trim() } : {}),
          ...(merged.length > 0 ? { results: merged } : {}),
        })
      } catch (e) {
        failMerchantSlotDispatchJob({
          jobId,
          message: e instanceof Error ? e.message : '网络错误',
        })
      }
    })()
  }

  const toggleCat = (id: number): void => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllFilteredCategories = (): void => {
    setSelectedCategoryIds(new Set(filteredCategories.map((c) => c.id)))
  }

  const clearCategorySelection = (): void => {
    setSelectedCategoryIds(new Set())
  }

  const categoryBulkActionsDisabled =
    selectedSiteId == null || catsLoading || filteredCategories.length === 0

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
              在 <strong>分类</strong> 列表发起：按类目关键词调用 DataForSEO Merchant Amazon Products，postback 结果写入本站{' '}
              <strong>Offer</strong>（无存量时会新建）。
              Tag 形如 <code>payload:category:…</code>。
              <strong>类目进度</strong>在本列表「Merchant 拉品」列；派发成功后，已绑定该类目的{' '}
              <strong>Offer</strong>「槽位拉取」会标为「运行中」（无匹配 Offer 时不标记）。
              <strong style={{ display: 'block', marginTop: '0.5rem', fontWeight: 600 }}>
                提交后窗口会立即关闭；顶栏 Banner 会先保持「进行中」，在 DataForSEO Webhook 将结果写入 Offer
                （类目「Merchant 拉品」列为完成/失败）后转为绿/红终态明细。若无公网 postback（如纯 localhost），约 15
                分钟会超时失败。
              </strong>
            </p>

            {error ?
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
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  marginBottom: '0.35rem',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ ...fieldLabel, marginBottom: 0 }}>分类（可多选）</span>
                <div style={{ display: 'flex', gap: '0.65rem', flexShrink: 0 }}>
                  <button
                    disabled={categoryBulkActionsDisabled}
                    style={{
                      border: 'none',
                      padding: 0,
                      background: 'transparent',
                      color: 'var(--theme-text)',
                      fontSize: '0.8125rem',
                      cursor: categoryBulkActionsDisabled ? 'not-allowed' : 'pointer',
                      opacity: categoryBulkActionsDisabled ? 0.45 : 0.9,
                      textDecoration: 'underline',
                      textUnderlineOffset: 2,
                    }}
                    type="button"
                    onClick={() => {
                      selectAllFilteredCategories()
                    }}
                  >
                    全选当前列表
                  </button>
                  <button
                    disabled={categoryBulkActionsDisabled}
                    style={{
                      border: 'none',
                      padding: 0,
                      background: 'transparent',
                      color: 'var(--theme-text)',
                      fontSize: '0.8125rem',
                      cursor: categoryBulkActionsDisabled ? 'not-allowed' : 'pointer',
                      opacity: categoryBulkActionsDisabled ? 0.45 : 0.9,
                      textDecoration: 'underline',
                      textUnderlineOffset: 2,
                    }}
                    type="button"
                    onClick={() => {
                      clearCategorySelection()
                    }}
                  >
                    清空选择
                  </button>
                </div>
              </div>
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
                disabled={selectedSiteId == null || selectedCategoryIds.size === 0}
                onClick={() => {
                  submit()
                }}
              >
                派发 DFS 任务
              </Button>
            </div>
          </div>
        </div>
      : null}
    </>
  )
}
