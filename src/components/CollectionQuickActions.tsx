'use client'

import { CategorySlotsQuickActionModal } from '@/components/CategorySlotsQuickActionModal'
import { OfferMerchantSlotQuickActionModal } from '@/components/OfferMerchantSlotQuickActionModal'
import { OfferReviewMdxQuickActionModal } from '@/components/OfferReviewMdxQuickActionModal'
import { TrustPagesBundleQuickActionModal } from '@/components/TrustPagesBundleQuickActionModal'
import { Button } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import type { WorkflowQuickKind } from '@/utilities/workflowQuickCreate'

type SiteOption = {
  id: number
  name: string
  slug: string
  primaryDomain: string
  /** 站点上的主产品；域名快捷操作用于预填 */
  mainProduct?: string | null
}

type CategoryOption = {
  id: number
  name: string
  slug: string
  description: string | null
}

function formatSiteLine(s: SiteOption): string {
  return `${s.name} (${s.slug}) ${s.primaryDomain}`
}

type BlueprintPickerOption = {
  id: number
  name: string
  slug: string
  mirroredSiteLayout: string | null
  site: SiteOption | null
}

function formatBlueprintLine(b: BlueprintPickerOption): string {
  const layout = b.mirroredSiteLayout ?? '—'
  if (!b.site) {
    return `${b.name}（${b.slug}）· 未关联站点 · 布局：${layout}`
  }
  return `${b.name}（${b.slug}）· ${b.site.name}（${b.site.slug}）· 布局：${layout}`
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

const UI: Record<
  WorkflowQuickKind,
  {
    buttonText: string
    title: string
    description: string
    topicLabel: string
    topicPlaceholder: string
    submitLabel: string
    showCategories: boolean
  }
> = {
  articles: {
    buttonText: '快捷操作 · 文章',
    title: '快捷操作 · 文章',
    description: '选定站点与可选分类后，发起「生成文章」工作流；主题会与分类说明合并传给后端。',
    topicLabel: '文章主题 / 要点（可选）',
    topicPlaceholder: '留空则由系统选题',
    submitLabel: '写文章（生成文章工作流）',
    showCategories: true,
  },
  pages: {
    buttonText: '快捷操作 · 页面',
    title: '快捷操作 · 页面',
    description: '选定站点与可选分类后，发起「生成页面」工作流；主题会与分类说明合并传给后端。',
    topicLabel: '页面主题 / 要点（可选）',
    topicPlaceholder: '留空则由系统选题',
    submitLabel: '生成页面（工作流）',
    showCategories: true,
  },
  categories: {
    buttonText: '快捷操作 · 分类',
    title: '快捷操作 · 分类',
    description: '选定站点与可选分类后，发起与分类相关的工作流；要点会与分类说明合并传给后端。',
    topicLabel: '说明 / 要点（可选）',
    topicPlaceholder: '留空则由系统根据上下文处理',
    submitLabel: '发起分类工作流',
    showCategories: true,
  },
  keywords: {
    buttonText: '快捷操作 · 关键词',
    title: '快捷操作 · 关键词',
    description: '选定站点后，发起关键词相关的工作流；可填写种子词或要点。',
    topicLabel: '要点 / 种子词（可选）',
    topicPlaceholder: '留空则由系统拓展',
    submitLabel: '发起关键词工作流',
    showCategories: false,
  },
  'site-blueprints': {
    buttonText: '快捷操作 · 设计工作流',
    title: '快捷操作 · 设计工作流',
    description:
      '选定站点与可选分类后，创建 workflow-jobs 排产任务；要点会与分类说明合并传给后端。',
    topicLabel: '设计说明 / 要点（可选）',
    topicPlaceholder: '留空则由系统根据上下文处理',
    submitLabel: '发起设计工作流',
    showCategories: true,
  },
  media: {
    buttonText: '快捷操作 · 媒体库',
    title: '快捷操作 · 媒体库',
    description: '选定站点后，发起与媒体处理相关的工作流；可填写要点或说明。',
    topicLabel: '要点 / 说明（可选）',
    topicPlaceholder: '留空则由系统处理',
    submitLabel: '发起媒体工作流',
    showCategories: false,
  },
}

type ArticleQuickMode = 'single' | 'batch'

function WorkflowQuickActionModal({ kind }: { kind: WorkflowQuickKind }): React.ReactElement {
  const ui = UI[kind]
  const isArticles = kind === 'articles'
  const [open, setOpen] = useState(false)
  const [articleMode, setArticleMode] = useState<ArticleQuickMode>('single')
  const [batchLimitInput, setBatchLimitInput] = useState('')
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
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([])

  const [topic, setTopic] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

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
    if (!ui.showCategories) {
      setCategories([])
      setSelectedCategoryIds([])
      return
    }
    if (selectedSiteId == null) {
      setCategories([])
      setSelectedCategoryIds([])
      return
    }
    void loadCategories(selectedSiteId)
    setSelectedCategoryIds([])
  }, [selectedSiteId, loadCategories, ui.showCategories])

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
    setSelectedCategoryIds([])
    setTopic('')
    setError(null)
    setSuccess(null)
    setArticleMode('single')
    setBatchLimitInput('')
  }

  const pickSite = (s: SiteOption): void => {
    setSelectedSiteId(s.id)
    setSelectedSiteLabel(formatSiteLine(s))
    setSiteQuery('')
    setSiteMenuOpen(false)
  }

  const clearSiteSelection = (): void => {
    setSelectedSiteId(null)
    setSelectedSiteLabel('')
    setSiteQuery('')
    void loadSites('')
  }

  const toggleCategory = (id: number): void => {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const submit = async (): Promise<void> => {
    if (selectedSiteId == null) {
      setError('请选择站点')
      return
    }
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      if (isArticles && articleMode === 'batch') {
        const lim = batchLimitInput.trim()
        let limit: number | undefined
        if (lim !== '') {
          const n = Number(lim)
          if (!Number.isFinite(n) || n < 1) {
            setError('本批上限须为 ≥1 的整数，或留空使用默认')
            setSubmitting(false)
            return
          }
          limit = Math.min(100, Math.floor(n))
        }
        const res = await fetch('/api/admin/articles/batch-enqueue', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId: selectedSiteId,
            ...(limit != null ? { limit } : {}),
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
          enqueued?: number
          skipped?: number
          usedKeywordFallback?: boolean
          errorsSample?: string[]
        }
        if (!res.ok) {
          throw new Error(typeof data.error === 'string' ? data.error : '批量入队失败')
        }
        const extra =
          (data.enqueued === 0 && (data.errorsSample?.length ?? 0) > 0
            ? ` · ${(data.errorsSample ?? []).join(' ')}`
            : '') + (data.usedKeywordFallback ? '（本批使用 draft 关键词：站点无 active 词）' : '')
        setSuccess(
          `已入队 ${data.enqueued ?? 0} 条 · 跳过 ${data.skipped ?? 0} 条${extra}`,
        )
        window.setTimeout(() => {
          close()
        }, 2000)
        return
      }

      const res = await fetch('/api/admin/workflow-quick-action', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          siteId: selectedSiteId,
          categoryIds:
            ui.showCategories && selectedCategoryIds.length > 0 ? selectedCategoryIds : undefined,
          topic: topic.trim() || undefined,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; id?: number }
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : '提交失败')
      }
      setSuccess(`已创建工作流任务 #${data.id ?? ''}`)
      window.setTimeout(() => {
        close()
      }, 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const titleId = `quick-action-title-${kind}`

  return (
    <>
      <Button buttonStyle="secondary" onClick={() => setOpen(true)} size="small" type="button">
        {ui.buttonText}
      </Button>

      {open ? (
        <div aria-modal aria-labelledby={titleId} role="dialog" style={backdropStyle}>
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
              {ui.title}
            </h2>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', opacity: 0.85, lineHeight: 1.5 }}>
              {ui.description}
            </p>

            {isArticles ? (
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginBottom: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <Button
                  buttonStyle={articleMode === 'single' ? 'primary' : 'secondary'}
                  size="small"
                  type="button"
                  onClick={() => setArticleMode('single')}
                >
                  单次快捷
                </Button>
                <Button
                  buttonStyle={articleMode === 'batch' ? 'primary' : 'secondary'}
                  size="small"
                  type="button"
                  onClick={() => setArticleMode('batch')}
                >
                  批量排产
                </Button>
              </div>
            ) : null}

            {isArticles && articleMode === 'single' ? (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.65rem 0.75rem',
                  borderRadius: 6,
                  border: '1px solid var(--theme-warning-500, #b45309)',
                  background: 'var(--theme-warning-50, rgba(250, 204, 21, 0.12))',
                  fontSize: '0.8125rem',
                  lineHeight: 1.5,
                }}
              >
                <p style={{ margin: '0 0 0.35rem' }}>单次入队为 ai_generate，执行器未接线，不会产文。</p>
                <p style={{ margin: 0 }}>请改用「批量排产」或到「关键词」用快捷操作。</p>
              </div>
            ) : null}

            {error ? (
              <p style={{ color: 'var(--theme-error-500)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
                {error}
              </p>
            ) : null}
            {success ? (
              <p style={{ color: 'var(--theme-success-500)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
                {success}
              </p>
            ) : null}

            <div ref={siteComboboxRef} style={{ marginBottom: '1rem', position: 'relative' }}>
              <span style={fieldLabel} id={`${kind}-site-label`}>
                站点
              </span>
              <button
                aria-expanded={siteMenuOpen}
                aria-haspopup="listbox"
                aria-labelledby={`${kind}-site-label`}
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
                          role="option"
                          aria-selected={selectedSiteId === s.id}
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

            {ui.showCategories && !(isArticles && articleMode === 'batch') ? (
              <div style={{ marginBottom: '1rem' }}>
                <span style={fieldLabel}>分类（可选）</span>
                {selectedSiteId == null ? (
                  <div style={{ ...inputStyle, opacity: 0.6 }}>请先选择站点</div>
                ) : categoriesLoading ? (
                  <div style={inputStyle}>加载中…</div>
                ) : categories.length === 0 ? (
                  <div style={{ ...inputStyle, opacity: 0.75 }}>暂无分类</div>
                ) : (
                  <div
                    style={{
                      ...inputStyle,
                      maxHeight: 160,
                      overflow: 'auto',
                      padding: '0.35rem',
                    }}
                  >
                    {categories.map((c) => (
                      <label
                        key={c.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '0.5rem',
                          padding: '0.25rem 0',
                          cursor: 'pointer',
                          fontSize: '0.8125rem',
                        }}
                      >
                        <input
                          checked={selectedCategoryIds.includes(c.id)}
                          type="checkbox"
                          onChange={() => toggleCategory(c.id)}
                        />
                        <span>
                          {c.name}
                          <span style={{ opacity: 0.65 }}> ({c.slug})</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {isArticles && articleMode === 'batch' ? (
              <div style={{ marginBottom: '1.25rem' }}>
                <span style={fieldLabel}>本批最大篇数（可选）</span>
                <input
                  inputMode="numeric"
                  placeholder="留空则按站点日 cap×7，且不超过 100"
                  style={inputStyle}
                  type="text"
                  value={batchLimitInput}
                  onChange={(e) => setBatchLimitInput(e.target.value)}
                />
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', opacity: 0.75 }}>
                  按关键词 <code>opportunityScore</code> 优先；已排队或进行中的词会跳过。由「工作流任务」+ pipeline tick 异步执行。
                </p>
              </div>
            ) : (
              <div style={{ marginBottom: '1.25rem' }}>
                <span style={fieldLabel}>{ui.topicLabel}</span>
                <textarea
                  placeholder={ui.topicPlaceholder}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <Button
                buttonStyle="secondary"
                type="button"
                {...(kind === 'site-blueprints' ? {} : { disabled: submitting })}
                onClick={close}
              >
                关闭
              </Button>
              <Button
                type="button"
                disabled={submitting || selectedSiteId == null}
                onClick={() => void submit()}
              >
                {isArticles && articleMode === 'batch' ? '执行批量排产' : ui.submitLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

const amzDesignTitleId = 'quick-action-title-amz-design'

function AmzTemplateDesignQuickActionModal(): React.ReactElement {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [bpQuery, setBpQuery] = useState('')
  const [blueprints, setBlueprints] = useState<BlueprintPickerOption[]>([])
  const [blueprintsLoading, setBlueprintsLoading] = useState(false)
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<number | null>(null)
  const [selectedBlueprintLabel, setSelectedBlueprintLabel] = useState('')
  const [bpMenuOpen, setBpMenuOpen] = useState(false)
  const bpComboboxRef = useRef<HTMLDivElement>(null)
  const skipBpQueryDebounceRef = useRef(false)

  const [mainProduct, setMainProduct] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [error, setError] = useState<string | null>(null)

  const loadBlueprints = useCallback(async (q: string) => {
    setBlueprintsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/admin/site-blueprints/options?${params}`, {
        credentials: 'include',
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: unknown }
        throw new Error(typeof err.error === 'string' ? err.error : '加载设计列表失败')
      }
      const data = (await res.json()) as { blueprints: BlueprintPickerOption[] }
      setBlueprints(data.blueprints ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载设计列表失败')
      setBlueprints([])
    } finally {
      setBlueprintsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open || !bpMenuOpen) return
    if (skipBpQueryDebounceRef.current) {
      skipBpQueryDebounceRef.current = false
      return
    }
    const t = window.setTimeout(() => {
      void loadBlueprints(bpQuery)
    }, 300)
    return () => window.clearTimeout(t)
  }, [open, bpMenuOpen, bpQuery, loadBlueprints])

  useEffect(() => {
    if (!bpMenuOpen) return
    const onDocMouseDown = (e: MouseEvent): void => {
      const root = bpComboboxRef.current
      if (root && !root.contains(e.target as Node)) {
        setBpMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [bpMenuOpen])

  useEffect(() => {
    if (!bpMenuOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setBpMenuOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [bpMenuOpen])

  const close = (): void => {
    setOpen(false)
    setBpQuery('')
    setBlueprints([])
    setSelectedBlueprintId(null)
    setSelectedBlueprintLabel('')
    setBpMenuOpen(false)
    setMainProduct('')
    setAiModel('')
    setError(null)
  }

  const pickBlueprint = (b: BlueprintPickerOption): void => {
    setSelectedBlueprintId(b.id)
    setSelectedBlueprintLabel(formatBlueprintLine(b))
    setMainProduct(String(b.site?.mainProduct ?? '').trim())
    setBpQuery('')
    setBpMenuOpen(false)
  }

  const clearBlueprintSelection = (): void => {
    setSelectedBlueprintId(null)
    setSelectedBlueprintLabel('')
    setMainProduct('')
    setBpQuery('')
    void loadBlueprints('')
  }

  const submit = async (): Promise<void> => {
    if (selectedBlueprintId == null) {
      setError('请选择设计')
      return
    }
    const mainTrim = mainProduct.trim()
    if (!mainTrim) {
      setError('请填写主产品（或与关联站点已保存的主品一致）')
      return
    }
    setError(null)

    const blueprintId = selectedBlueprintId
    const aiModelTrim = aiModel.trim()
    const baseBody = {
      blueprintId,
      mainProduct: mainTrim,
      ...(aiModelTrim ? { aiModel: aiModelTrim } : {}),
    }

    try {
      const prepRes = await fetch('/api/admin/site-blueprints/generate-amz-template-design', {
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
        setError(
          typeof prepData.error === 'string'
            ? prepData.error
            : `请求失败（HTTP ${prepRes.status}）`,
        )
        return
      }
    } catch {
      setError('网络错误，请稍后重试')
      return
    }

    close()

    if (
      typeof window !== 'undefined' &&
      window.location.pathname.includes('/collections/site-blueprints')
    ) {
      router.refresh()
    }

    void (async () => {
      try {
        const res = await fetch('/api/admin/site-blueprints/generate-amz-template-design', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...baseBody, afterPrepare: true }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
        }
        if (!res.ok || data.ok !== true) {
          console.warn(
            '[generate-amz-template-design]',
            typeof data.error === 'string' ? data.error : `HTTP ${res.status}`,
          )
        }
      } catch (e) {
        console.warn('[generate-amz-template-design] network error', e)
      } finally {
        if (
          typeof window !== 'undefined' &&
          window.location.pathname.includes('/collections/site-blueprints')
        ) {
          router.refresh()
        }
      }
    })()
  }

  return (
    <>
      <Button buttonStyle="secondary" onClick={() => setOpen(true)} size="small" type="button">
        快捷操作 · 生成 AMZ 设计
      </Button>

      {open ? (
        <div aria-labelledby={amzDesignTitleId} aria-modal role="dialog" style={backdropStyle}>
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
              id={amzDesignTitleId}
              style={{ margin: '0 0 0.75rem', fontSize: '1.125rem', fontWeight: 600 }}
            >
              快捷操作 · 生成 AMZ 设计
            </h2>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', opacity: 0.85, lineHeight: 1.5 }}>
              对齐 n8n「Generate Template Design」：用 OpenRouter 根据主产品与 niche 改写所选「设计」的{' '}
              <strong>amzSiteConfigJson</strong>。前置：该「设计」已选定「站点」，且对应站点的「站点布局」为{' '}
              <strong>amz-template-1</strong>。导航主菜单、页脚固定链接与首页分类项会在服务端保持与合并前一致。需配置
              OPENROUTER_API_KEY 或 OPENAI_API_KEY。
              <strong style={{ display: 'block', marginTop: '0.5rem', fontWeight: 600 }}>
                点击「生成并写回设计」后先标为「运行中」并关闭弹窗，列表会马上刷新；生成结束后若仍在本列表页会再刷新一次以显示「已完成」或「错误」。进度请在表格「设计流程状态」列查看。
              </strong>
            </p>

            {error ? (
              <p style={{ color: 'var(--theme-error-500)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
                {error}
              </p>
            ) : null}

            <div ref={bpComboboxRef} style={{ marginBottom: '1rem', position: 'relative' }}>
              <span style={fieldLabel} id="amz-design-bp-label">
                设计
              </span>
              <button
                aria-expanded={bpMenuOpen}
                aria-haspopup="listbox"
                aria-labelledby="amz-design-bp-label"
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
                  setBpMenuOpen((prev) => {
                    const next = !prev
                    if (next) {
                      skipBpQueryDebounceRef.current = true
                      void loadBlueprints(bpQuery)
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
                    opacity: selectedBlueprintId == null ? 0.55 : 1,
                  }}
                >
                  {selectedBlueprintId == null ? '请选择设计' : selectedBlueprintLabel}
                </span>
                <span aria-hidden style={{ flexShrink: 0, opacity: 0.65, fontSize: '0.65rem' }}>
                  {bpMenuOpen ? '▲' : '▼'}
                </span>
              </button>

              {bpMenuOpen ? (
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
                    aria-label="筛选设计"
                    autoComplete="off"
                    placeholder="输入设计名称或 slug 筛选…"
                    style={inputStyle}
                    type="search"
                    value={bpQuery}
                    onChange={(e) => setBpQuery(e.target.value)}
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
                      onClick={() => clearBlueprintSelection()}
                    >
                      清空选择
                    </button>
                    {blueprintsLoading ? (
                      <span style={{ fontSize: '0.75rem', opacity: 0.7, padding: '0.25rem 0.5rem' }}>
                        加载中…
                      </span>
                    ) : (
                      blueprints.map((b) => (
                        <button
                          key={b.id}
                          aria-selected={selectedBlueprintId === b.id}
                          role="option"
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '0.45rem 0.5rem',
                            border: 'none',
                            borderRadius: 4,
                            background:
                              selectedBlueprintId === b.id
                                ? 'var(--theme-elevation-100)'
                                : 'transparent',
                            color: 'inherit',
                            cursor: 'pointer',
                            fontSize: '0.8125rem',
                            opacity: b.site ? 1 : 0.55,
                          }}
                          type="button"
                          onClick={() => pickBlueprint(b)}
                        >
                          {formatBlueprintLine(b)}
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
                placeholder="参与 AI 提示词；若与站点字段不同，提交后会写回站点的「主品 / Main product」。"
                rows={2}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
                value={mainProduct}
                onChange={(e) => setMainProduct(e.target.value)}
              />
            </div>

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
                disabled={selectedBlueprintId == null}
                onClick={() => {
                  void submit()
                }}
              >
                生成并写回设计
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

const siteDomainTitleId = 'quick-action-title-site-domain'

function SiteDomainQuickActionModal(): React.ReactElement {
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

  const submit = async (): Promise<void> => {
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
      ...(aiModelTrim ? { ai_model: aiModelTrim } : {}),
    }

    try {
      const prepRes = await fetch('/api/admin/sites/generate-domain', {
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
        setError(
          typeof prepData.error === 'string'
            ? prepData.error
            : `请求失败（HTTP ${prepRes.status}）`,
        )
        return
      }
    } catch {
      setError('网络错误，请稍后重试')
      return
    }

    close()

    if (
      typeof window !== 'undefined' &&
      window.location.pathname.includes('/collections/sites')
    ) {
      router.refresh()
    }

    void (async () => {
      try {
        const res = await fetch('/api/admin/sites/generate-domain', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(baseBody),
        })
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
        }
        if (!res.ok || data.ok !== true) {
          console.warn(
            '[generate-domain]',
            typeof data.error === 'string' ? data.error : `HTTP ${res.status}`,
          )
        }
      } catch (e) {
        console.warn('[generate-domain] network error', e)
      } finally {
        if (
          typeof window !== 'undefined' &&
          window.location.pathname.includes('/collections/sites')
        ) {
          router.refresh()
        }
      }
    })()
  }

  return (
    <>
      <Button buttonStyle="secondary" onClick={() => setOpen(true)} size="small" type="button">
        快捷操作 · 生成域名
      </Button>

      {open ? (
        <div
          aria-labelledby={siteDomainTitleId}
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
              id={siteDomainTitleId}
              style={{ margin: '0 0 0.75rem', fontSize: '1.125rem', fontWeight: 600 }}
            >
              快捷操作 · 生成域名
            </h2>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', opacity: 0.85, lineHeight: 1.5 }}>
              受众与域名由 OpenRouter 生成，可查由 Spaceship 校验；写回主域名时会把 slug 同步为「域名中的点换成连字符」。主产品会参与提示词；若填写则一并保存到站点字段。需配置服务端
              OPENROUTER / SPACESHIP 密钥。
              <strong style={{ display: 'block', marginTop: '0.5rem', fontWeight: 600 }}>
                点击「生成域名并写回站点」后先标为「运行中」并关闭弹窗，列表会马上刷新；全流程结束后若仍在本列表页会再刷新一次以显示「已完成」或「错误」。若已离开本页或状态未变，可手动刷新。
              </strong>
            </p>

            {error ? (
              <p style={{ color: 'var(--theme-error-500)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
                {error}
              </p>
            ) : null}

            <div ref={siteComboboxRef} style={{ marginBottom: '1rem', position: 'relative' }}>
              <span style={fieldLabel} id="site-domain-gen-label">
                站点
              </span>
              <button
                aria-expanded={siteMenuOpen}
                aria-haspopup="listbox"
                aria-labelledby="site-domain-gen-label"
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
                placeholder="用于受众/域名提示词；选站点后会预填站点已保存的值。若填写则本次会写入站点的「主品 / Main product」字段。"
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
              强制换域（在可用标准价域名中尽量替换当前主域名）
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
                  void submit()
                }}
              >
                生成域名并写回站点
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export function ArticleListQuickAction(): React.ReactElement {
  return <WorkflowQuickActionModal kind="articles" />
}

export function PageListQuickAction(): React.ReactElement {
  return (
    <>
      <TrustPagesBundleQuickActionModal />
      <WorkflowQuickActionModal kind="pages" />
    </>
  )
}

export function CategoryListQuickAction(): React.ReactElement {
  return (
    <>
      <CategorySlotsQuickActionModal />
      <WorkflowQuickActionModal kind="categories" />
    </>
  )
}

export function KeywordListQuickAction(): React.ReactElement {
  return <WorkflowQuickActionModal kind="keywords" />
}

export function OfferListQuickAction(): React.ReactElement {
  return (
    <>
      <OfferMerchantSlotQuickActionModal />
      <OfferReviewMdxQuickActionModal />
    </>
  )
}

export function DesignListQuickAction(): React.ReactElement {
  return (
    <>
      <AmzTemplateDesignQuickActionModal />
      <WorkflowQuickActionModal kind="site-blueprints" />
    </>
  )
}

export function MediaListQuickAction(): React.ReactElement {
  return <WorkflowQuickActionModal kind="media" />
}

export function SiteListQuickAction(): React.ReactElement {
  return <SiteDomainQuickActionModal />
}
