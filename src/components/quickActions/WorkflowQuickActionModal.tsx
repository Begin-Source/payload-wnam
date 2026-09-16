'use client'
import { WritingScopeFullPipelineDrawer } from '@/components/WritingScopeFullPipelineDrawer'
import { useAdminBackgroundActivity } from '@/components/adminBackgroundActivity/AdminBackgroundActivityProvider'
import { Button } from '@payloadcms/ui'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkflowQuickKind } from '@/utilities/workflowQuickCreate'
import { SiteOption, CategoryOption, formatSiteLine, backdropStyle, panelStyle, fieldLabel, inputStyle, workflowQuickWarnBoxStyle, UI, ArticleQuickMode } from './model'
export function WorkflowQuickActionModal({ kind }: { kind: WorkflowQuickKind }): React.ReactElement {
  const ui = UI[kind]
  const isArticles = kind === 'articles'
  const { startBatchEnqueueJob, completeBatchEnqueueJob, failBatchEnqueueJob } =
    useAdminBackgroundActivity()
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

  const [quickMenuOpen, setQuickMenuOpen] = useState(false)
  const [writingPipelineOpen, setWritingPipelineOpen] = useState(false)
  const quickMenuRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!isArticles || !quickMenuOpen) return
    const onDocMouseDown = (e: MouseEvent): void => {
      const root = quickMenuRef.current
      if (root && !root.contains(e.target as Node)) {
        setQuickMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [isArticles, quickMenuOpen])

  useEffect(() => {
    if (!isArticles || !quickMenuOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setQuickMenuOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [isArticles, quickMenuOpen])

  const close = (): void => {
    setOpen(false)
    setQuickMenuOpen(false)
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
        const siteLabelSnap = selectedSiteLabel.trim()
        const siteIdSnap = selectedSiteId
        const jobId = startBatchEnqueueJob(siteLabelSnap ? { siteLabel: siteLabelSnap } : {})
        close()
        void (async () => {
          try {
            const res = await fetch('/api/admin/articles/batch-enqueue', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                siteId: siteIdSnap,
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
              failBatchEnqueueJob({
                jobId,
                message: typeof data.error === 'string' ? data.error : '批量入队失败',
              })
              return
            }
            completeBatchEnqueueJob({
              jobId,
              summary: {
                enqueued: data.enqueued ?? 0,
                skipped: data.skipped ?? 0,
                usedKeywordFallback: data.usedKeywordFallback,
                errorsSample: data.errorsSample,
              },
            })
          } catch {
            failBatchEnqueueJob({ jobId, message: '批量入队请求失败' })
          }
        })()
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

  const menuItemStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '0.5rem 0.6rem',
    border: 'none',
    borderRadius: 4,
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: '0.8125rem',
  }

  return (
    <>
      {isArticles ? (
        <div ref={quickMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
          <Button
            aria-expanded={quickMenuOpen}
            aria-haspopup="menu"
            buttonStyle="secondary"
            size="small"
            type="button"
            onClick={() => setQuickMenuOpen((v) => !v)}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {ui.buttonText}
              <span aria-hidden style={{ opacity: 0.65, fontSize: '0.65rem' }}>
                {quickMenuOpen ? '▲' : '▼'}
              </span>
            </span>
          </Button>
          {quickMenuOpen ? (
            <div
              role="menu"
              style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: 4,
                zIndex: 20,
                minWidth: 240,
                borderRadius: 6,
                border: '1px solid var(--theme-elevation-150)',
                background: 'var(--theme-elevation-0)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                padding: '0.35rem',
              }}
            >
              <button
                role="menuitem"
                style={menuItemStyle}
                type="button"
                onClick={() => {
                  setQuickMenuOpen(false)
                  setOpen(true)
                }}
              >
                打开快捷操作（站点 / 排产…）
              </button>
              <button
                role="menuitem"
                style={menuItemStyle}
                type="button"
                onClick={() => {
                  setQuickMenuOpen(false)
                  setWritingPipelineOpen(true)
                }}
              >
                一键跑通写作流水线
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <Button buttonStyle="secondary" onClick={() => setOpen(true)} size="small" type="button">
          {ui.buttonText}
        </Button>
      )}

      {isArticles ? (
        <WritingScopeFullPipelineDrawer
          open={writingPipelineOpen}
          onClose={() => setWritingPipelineOpen(false)}
        />
      ) : null}

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
              <div style={workflowQuickWarnBoxStyle}>
                <p style={{ margin: '0 0 0.35rem' }}>单次入队为 ai_generate，执行器未接线，不会产文。</p>
                <p style={{ margin: 0 }}>请改用「批量排产」或到「关键词」用快捷操作。</p>
              </div>
            ) : null}

            {!isArticles ? (
              <div style={workflowQuickWarnBoxStyle}>
                <p style={{ margin: '0 0 0.35rem' }}>
                  此入口会创建 <code style={{ fontSize: '0.78em' }}>jobType: ai_generate</code>{' '}
                  的工作流任务；当前{' '}
                  <code style={{ fontSize: '0.78em' }}>/api/pipeline/tick</code> 对该类型<strong>未接线</strong>
                  ，不会在后台自动执行具体生成步骤。
                </p>
                {kind === 'categories' ? (
                  <p style={{ margin: 0 }}>
                    分类封面与槽位请优先使用本列表上的「Together · 分类封面」「快捷操作 · 生成分类槽位」。
                  </p>
                ) : (
                  <p style={{ margin: 0 }}>如需自动化流水线，请使用该列表或其它菜单上已接线的专用入口。</p>
                )}
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
