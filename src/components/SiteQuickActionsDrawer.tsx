'use client'

import { Button } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type DomainSiteOption = {
  id: number
  name: string
  slug: string
  primaryDomain: string
  mainProduct?: string | null
  siteLayout?: string | null
}

type TogetherSiteOption = {
  id: number
  name: string
  slug: string
  primaryDomain: string
  siteLayout?: string | null
}

function formatDomainSiteLine(s: DomainSiteOption): string {
  return `${s.name} (${s.slug}) ${s.primaryDomain}`
}

function formatTogetherSiteLine(s: TogetherSiteOption): string {
  return `${s.name} (${s.slug}) · ${s.siteLayout ?? '—'} · ${s.primaryDomain || '—'}`
}

function isAmzShell(siteLayout: string | null | undefined): boolean {
  return siteLayout === 'amz-template-1' || siteLayout === 'amz-template-2'
}

const Z_DRAWER = 10000

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: Z_DRAWER,
  border: 'none',
  padding: 0,
  margin: 0,
  cursor: 'pointer',
  background: 'rgba(0, 0, 0, 0.45)',
}

const drawerPanelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: 'min(28rem, 100vw)',
  zIndex: Z_DRAWER + 1,
  display: 'flex',
  flexDirection: 'column',
  borderLeft: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-0)',
  boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
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

const siteDomainTitleId = 'quick-action-title-site-domain-drawer'

type TabId = 'domain' | 'hero' | 'logo'

function TogetherSiteJobsSection(props: {
  kind: 'hero' | 'logo'
  sites: TogetherSiteOption[]
  sitesLoading: boolean
  loadError: string | null
}): React.ReactElement {
  const { kind, sites, sitesLoading, loadError } = props
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [promptOverride, setPromptOverride] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const amzSites = useMemo(() => sites.filter((s) => isAmzShell(s.siteLayout)), [sites])

  const toggle = (id: number): void => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const submit = async (): Promise<void> => {
    if (selectedIds.length === 0) {
      setError('请选择至少一个 AMZ 布局站点')
      return
    }
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    const postPath =
      kind === 'hero' ? '/api/admin/sites/queue-hero-banner' : '/api/admin/sites/queue-site-logo'
    try {
      const res = await fetch(postPath, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteIds: selectedIds,
          ...(promptOverride.trim() ? { prompt: promptOverride.trim().slice(0, 4000) } : {}),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        queuedCount?: number
        skipped?: { id: number; reason: string }[]
      }
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
      }
      const skipMsg =
        Array.isArray(data.skipped) && data.skipped.length > 0
          ? ` · 跳过 ${data.skipped.length}（${data.skipped
              .slice(0, 3)
              .map((x) => `#${x.id}:${x.reason}`)
              .join(', ')}）`
          : ''
      const msgHero = `已入队 Together 横幅任务 ${data.queuedCount ?? 0} 条（见「工作流任务」。每次 tick 处理一条）。${skipMsg}`
      const msgLogo = `已入队 Together 站点 Logo ${data.queuedCount ?? 0} 条（见「工作流任务」。每次 tick 处理一条）。同一 URL 用作顶栏与标签页图标。${skipMsg}`
      setSuccess(kind === 'hero' ? msgHero : msgLogo)
      if (typeof window !== 'undefined' && window.location.pathname.includes('/collections/sites')) {
        router.refresh()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const title =
    kind === 'hero' ? 'Together · AMZ 首页 Hero 横幅' : 'Together · AMZ 站点 Logo / Favicon'
  const hintHero =
    '仅列出布局为 amz-template-1 / amz-template-2 的站点。将创建 hero_banner_generate 队列任务（需 TOGETHER_API_KEY、pipeline tick）；生成后写入站点「首页 Hero 横幅」并在首页首屏叠加显示。'
  const hintLogo =
    '仅列出布局为 amz-template-1 / amz-template-2 的站点。将创建 site_logo_generate 队列任务（需 TOGETHER_API_KEY、pipeline tick）；生成后写入「站点 Logo / 标签页图标」，并注入 AMZ brand.logo 与 Next metadata icons。'
  const placeholderHero = '留空则按站点名、主品、设计中 Hero 文案自动组合'
  const placeholderLogo = '留空则按站点名、主品、设计中 brand.name / 调性自动组合'

  return (
    <div>
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
      <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', opacity: 0.85, lineHeight: 1.55 }}>
        {kind === 'hero' ? hintHero : hintLogo}
      </p>

      {loadError ? (
        <p style={{ color: 'var(--theme-error-500)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
          {loadError}
        </p>
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

      <div style={{ marginBottom: '1rem' }}>
        <span style={fieldLabel}>站点（AMZ · 多选）</span>
        {sitesLoading ? (
          <div style={inputStyle}>加载中…</div>
        ) : amzSites.length === 0 ? (
          <div style={{ ...inputStyle, opacity: 0.85 }}>
            当前列表中无 AMZ 布局站点。请先将站点布局改为 amz-template-1 / 2。
          </div>
        ) : (
          <div style={{ ...inputStyle, maxHeight: 220, overflow: 'auto', padding: '0.35rem' }}>
            {amzSites.map((s) => (
              <label
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  marginBottom: '0.35rem',
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                }}
              >
                <input
                  checked={selectedIds.includes(s.id)}
                  style={{ marginTop: 4 }}
                  type="checkbox"
                  onChange={() => toggle(s.id)}
                />
                <span>{formatTogetherSiteLine(s)}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <span style={fieldLabel}>Together 提示词覆盖（可选）</span>
        <textarea
          placeholder={kind === 'hero' ? placeholderHero : placeholderLogo}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          value={promptOverride}
          onChange={(e) => setPromptOverride(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
        <Button disabled={submitting || amzSites.length === 0} onClick={() => void submit()} size="small">
          {submitting ? '提交中…' : '加入队列'}
        </Button>
      </div>
    </div>
  )
}

function SiteDomainSection(props: { onSuccessCloseDrawer: () => void }): React.ReactElement {
  const { onSuccessCloseDrawer } = props
  const router = useRouter()
  const [siteQuery, setSiteQuery] = useState('')
  const [sites, setSites] = useState<DomainSiteOption[]>([])
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
      const data = (await res.json()) as { sites: DomainSiteOption[] }
      setSites(data.sites ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载站点失败')
      setSites([])
    } finally {
      setSitesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!siteMenuOpen) return
    if (skipSiteQueryDebounceRef.current) {
      skipSiteQueryDebounceRef.current = false
      return
    }
    const t = window.setTimeout(() => {
      void loadSites(siteQuery)
    }, 300)
    return () => window.clearTimeout(t)
  }, [siteMenuOpen, siteQuery, loadSites])

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

  const resetDomainForm = (): void => {
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

  const pickSite = (s: DomainSiteOption): void => {
    setSelectedSiteId(s.id)
    setSelectedSiteLabel(formatDomainSiteLine(s))
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

    resetDomainForm()
    onSuccessCloseDrawer()

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
    <div>
      <h3 id={siteDomainTitleId} style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600 }}>
        快捷操作 · 生成域名
      </h3>
      <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', opacity: 0.85, lineHeight: 1.5 }}>
        受众与域名由 OpenRouter 生成，可查由 Spaceship 校验；写回主域名时会把 slug 同步为「域名中的点换成连字符」。主产品会参与提示词；若填写则一并保存到站点字段。需配置服务端
        OPENROUTER / SPACESHIP 密钥。
        <strong style={{ display: 'block', marginTop: '0.5rem', fontWeight: 600 }}>
          点击「生成域名并写回站点」后先标为「运行中」并关闭抽屉，列表会马上刷新；全流程结束后若仍在本列表页会再刷新一次以显示「已完成」或「错误」。若已离开本页或状态未变，可手动刷新。
        </strong>
      </p>

      {error ? (
        <p style={{ color: 'var(--theme-error-500)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
          {error}
        </p>
      ) : null}

      <div ref={siteComboboxRef} style={{ marginBottom: '1rem', position: 'relative' }}>
        <span style={fieldLabel} id="site-domain-gen-label-drawer">
          站点
        </span>
        <button
          aria-expanded={siteMenuOpen}
          aria-haspopup="listbox"
          aria-labelledby="site-domain-gen-label-drawer"
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
                        selectedSiteId === s.id ? 'var(--theme-elevation-100)' : 'transparent',
                      color: 'inherit',
                      cursor: 'pointer',
                      fontSize: '0.8125rem',
                    }}
                    type="button"
                    onClick={() => pickSite(s)}
                  >
                    {formatDomainSiteLine(s)}
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
  )
}

export function SiteQuickActionsDrawer(): React.ReactElement {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [tab, setTab] = useState<TabId>('domain')

  const [togetherSites, setTogetherSites] = useState<TogetherSiteOption[]>([])
  const [togetherLoading, setTogetherLoading] = useState(false)
  const [togetherLoadError, setTogetherLoadError] = useState<string | null>(null)

  const loadTogetherSites = useCallback(async () => {
    setTogetherLoading(true)
    setTogetherLoadError(null)
    try {
      const res = await fetch('/api/admin/article-quick-action/options', {
        credentials: 'include',
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: unknown }
        throw new Error(typeof err.error === 'string' ? err.error : '加载站点失败')
      }
      const data = (await res.json()) as { sites: TogetherSiteOption[] }
      setTogetherSites(data.sites ?? [])
    } catch (e) {
      setTogetherLoadError(e instanceof Error ? e.message : '加载站点失败')
      setTogetherSites([])
    } finally {
      setTogetherLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!drawerOpen) return
    void loadTogetherSites()
  }, [drawerOpen, loadTogetherSites])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setDrawerOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  useEffect(() => {
    if (!drawerOpen) {
      setTab('domain')
      setTogetherSites([])
      setTogetherLoadError(null)
    }
  }, [drawerOpen])

  const tabButton = (id: TabId, label: string): React.ReactElement => (
    <button
      type="button"
      data-tab-active={tab === id ? 'true' : 'false'}
      style={{
        flex: 1,
        padding: '0.45rem 0.5rem',
        fontSize: '0.78rem',
        fontWeight: tab === id ? 600 : 400,
        border:
          tab === id
            ? '1px solid var(--theme-elevation-250)'
            : '1px solid var(--theme-elevation-150)',
        borderRadius: 6,
        background: tab === id ? 'var(--theme-elevation-100)' : 'transparent',
        color: 'inherit',
        cursor: 'pointer',
      }}
      onClick={() => setTab(id)}
    >
      {label}
    </button>
  )

  return (
    <>
      <Button buttonStyle="secondary" onClick={() => setDrawerOpen(true)} size="small" type="button">
        快捷操作 · 站点
      </Button>

      {drawerOpen ? (
        <>
          <button
            aria-label="关闭"
            style={backdropStyle}
            type="button"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            aria-modal
            role="dialog"
            style={drawerPanelStyle}
            onKeyDown={(ev) => {
              if (ev.key === 'Escape') setDrawerOpen(false)
            }}
          >
            <div
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid var(--theme-elevation-150)',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>快捷操作 · 站点</h2>
              <Button buttonStyle="secondary" onClick={() => setDrawerOpen(false)} size="small" type="button">
                关闭
              </Button>
            </div>

            <div
              style={{
                flexShrink: 0,
                display: 'flex',
                gap: '0.35rem',
                padding: '0.65rem 1.25rem',
                borderBottom: '1px solid var(--theme-elevation-150)',
              }}
              role="tablist"
            >
              {tabButton('domain', '生成域名')}
              {tabButton('hero', 'Together · 横幅')}
              {tabButton('logo', 'Together · Logo')}
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '1.25rem' }}>
              {tab === 'domain' ? (
                <SiteDomainSection onSuccessCloseDrawer={() => setDrawerOpen(false)} />
              ) : null}
              {tab === 'hero' ? (
                <TogetherSiteJobsSection
                  key="together-hero"
                  kind="hero"
                  loadError={togetherLoadError}
                  sites={togetherSites}
                  sitesLoading={togetherLoading}
                />
              ) : null}
              {tab === 'logo' ? (
                <TogetherSiteJobsSection
                  key="together-logo"
                  kind="logo"
                  loadError={togetherLoadError}
                  sites={togetherSites}
                  sitesLoading={togetherLoading}
                />
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </>
  )
}
