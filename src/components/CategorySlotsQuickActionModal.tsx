'use client'

import type { CategorySlotsSyncRowResult } from '@/components/adminBackgroundActivity/AdminBackgroundActivityContext'
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
  width: 'min(32rem, 100%)',
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

const categorySlotsTitleId = 'quick-action-title-category-slots'

function parseCategorySlotsSyncResults(raw: unknown): CategorySlotsSyncRowResult[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: CategorySlotsSyncRowResult[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const idx = typeof o.slotIndex === 'number' ? o.slotIndex : Number(o.slotIndex)
    if (!Number.isFinite(idx)) continue
    const slotIndex = Math.floor(idx)
    if (slotIndex < 1 || slotIndex > 5) continue

    const categoryIdRaw = o.categoryId
    let categoryId: number | undefined
    if (categoryIdRaw != null) {
      const nid =
        typeof categoryIdRaw === 'number' ? categoryIdRaw : Number(categoryIdRaw)
      if (Number.isFinite(nid)) categoryId = Math.floor(nid)
    }

    out.push({
      slotIndex,
      ok: o.ok === true,
      ...(categoryId !== undefined ? { categoryId } : {}),
      ...(typeof o.name === 'string' ? { name: o.name } : {}),
      ...(typeof o.slug === 'string' ? { slug: o.slug } : {}),
      ...(typeof o.error === 'string' ? { error: o.error } : {}),
      ...(typeof o.message === 'string' ? { message: o.message } : {}),
    })
  }
  return out.length > 0 ? out : undefined
}

export function CategorySlotsQuickActionModal(): React.ReactElement {
  const { startCategorySlotsJob, completeCategorySlotsJob, failCategorySlotsJob } =
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

  const [force, setForce] = useState(false)
  const [mainProduct, setMainProduct] = useState('')
  const [aiModel, setAiModel] = useState('')
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
    setSiteMenuOpen(false)
    setForce(false)
    setMainProduct('')
    setAiModel('')
    setError(null)
  }

  const pickSite = (s: SiteOption): void => {
    setSelectedSiteId(s.id)
    setSelectedSiteLabel(formatSiteLine(s))
    setMainProduct(String(s.mainProduct ?? '').trim())
    setSiteQuery('')
    setSiteMenuOpen(false)
  }

  const clearSiteSelection = (): void => {
    setSelectedSiteId(null)
    setSelectedSiteLabel('')
    setMainProduct('')
    setSiteQuery('')
    void loadSites('')
  }

  const submit = (): void => {
    if (selectedSiteId == null) {
      setError('请选择站点')
      return
    }
    setError(null)

    const siteId = selectedSiteId
    const forceBool = force
    const mainProductTrim = mainProduct.trim()
    const aiModelTrim = aiModel.trim()

    const baseBody = {
      siteId,
      force: forceBool,
      ...(mainProductTrim ? { mainProduct: mainProductTrim } : {}),
      ...(aiModelTrim ? { aiModel: aiModelTrim } : {}),
    }

    const siteLabelSnapshot = selectedSiteLabel
    const jobId = startCategorySlotsJob(
      siteLabelSnapshot.trim() ? { siteLabel: siteLabelSnapshot } : {},
    )
    close()

    void (async () => {
      try {
        const prepRes = await fetch('/api/admin/categories/generate-slots', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...baseBody, prepare: true }),
        })
        const prepData = (await prepRes.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
        }
        if (!prepRes.ok || prepData.ok !== true) {
          const errText =
            typeof prepData.error === 'string'
              ? prepData.error
              : `请求失败（HTTP ${prepRes.status}）`
          failCategorySlotsJob({ jobId, message: errText })
          return
        }

        const res = await fetch('/api/admin/categories/generate-slots', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...baseBody, afterPrepare: true }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
          results?: unknown
          okCount?: unknown
          failCount?: unknown
        }
        if (!res.ok || data.ok !== true) {
          const errText =
            typeof data.error === 'string' ? data.error : `请求失败（HTTP ${res.status}）`
          failCategorySlotsJob({ jobId, message: errText })
          return
        }
        const rowResults = parseCategorySlotsSyncResults(data.results)
        const okCount = typeof data.okCount === 'number' ? data.okCount : undefined
        const failCount = typeof data.failCount === 'number' ? data.failCount : undefined
        completeCategorySlotsJob({ jobId, okCount, failCount, results: rowResults })
      } catch (e) {
        failCategorySlotsJob({
          jobId,
          message: e instanceof Error ? e.message : '网络错误，请稍后重试',
        })
      }
    })()
  }

  return (
    <>
      <Button buttonStyle="secondary" onClick={() => setOpen(true)} size="small" type="button">
        快捷操作 · 生成分类槽位
      </Button>

      {open ? (
        <div
          aria-labelledby={categorySlotsTitleId}
          aria-modal
          role="dialog"
          style={backdropStyle}
        >
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
              id={categorySlotsTitleId}
              style={{ margin: '0 0 0.75rem', fontSize: '1.125rem', fontWeight: 600 }}
            >
              快捷操作 · 生成分类槽位
            </h2>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', opacity: 0.85, lineHeight: 1.5 }}>
              对齐 n8n「Generate Category Slots」：按主品与站点 niche 调用 OpenRouter 生成短类目，再确定性产出 5
              条分类名称；写入本站「分类」集合中槽位 1–5（已有任意分类且未勾选强制时跳过 AI）。需配置 OPENROUTER_API_KEY
              或 OPENAI_API_KEY。
              <strong style={{ display: 'block', marginTop: '0.5rem', fontWeight: 600 }}>
                提交后窗口会立即关闭，后台继续执行；请在分类列表「分类槽位流程状态」列与顶栏 Banner
                查看进度（站点汇总字段为权威来源）。首轮校验或配额失败会以顶栏红条提示。
              </strong>
            </p>

            {error ? (
              <p style={{ color: 'var(--theme-error-500)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
                {error}
              </p>
            ) : null}

            <div ref={siteComboboxRef} style={{ marginBottom: '1rem', position: 'relative' }}>
              <span style={fieldLabel} id="category-slots-site-label">
                站点
              </span>
              <button
                aria-expanded={siteMenuOpen}
                aria-haspopup="listbox"
                aria-labelledby="category-slots-site-label"
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
                    placeholder="输入名称、slug 或域名筛选…"
                    style={inputStyle}
                    type="search"
                    value={siteQuery}
                    onChange={(e) => setSiteQuery(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div style={{ maxHeight: 200, overflow: 'auto', margin: '0 -0.25rem' }}>
                    <button
                      aria-selected={false}
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
                        opacity: 0.9,
                      }}
                      type="button"
                      onClick={() => clearSiteSelection()}
                    >
                      清空选择
                    </button>
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
                              selectedSiteId === s.id
                                ? 'var(--theme-elevation-100)'
                                : 'transparent',
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
              <span style={fieldLabel}>主产品</span>
              <textarea
                placeholder="参与 AI 提示词；选站点后会预填站点「主品」。未填写时需站点上已保存主品。"
                rows={2}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
                value={mainProduct}
                onChange={(e) => setMainProduct(e.target.value)}
              />
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1rem',
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              <input checked={force} type="checkbox" onChange={(e) => setForce(e.target.checked)} />
              强制重新生成（忽略已有分类，仍走 AI 与槽位写回）
            </label>

            <div style={{ marginBottom: '1.25rem' }}>
              <span style={fieldLabel}>OpenRouter 模型（可选）</span>
              <input
                placeholder="留空则 google/gemini-2.5-flash"
                style={inputStyle}
                type="text"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <Button buttonStyle="secondary" onClick={close} type="button">
                关闭
              </Button>
              <Button
                type="button"
                disabled={selectedSiteId == null}
                onClick={() => {
                  submit()
                }}
              >
                生成并写回分类槽位
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
