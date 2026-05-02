'use client'

import { Button } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useCallback, useEffect, useState } from 'react'

type SiteOption = {
  id: number
  name: string
  slug: string
  primaryDomain: string
  siteLayout?: string | null
}

function formatSiteLine(s: SiteOption): string {
  return `${s.name} (${s.slug}) · ${s.siteLayout ?? '—'} · ${s.primaryDomain || '—'}`
}

function isAmzShell(siteLayout: string | null | undefined): boolean {
  return siteLayout === 'amz-template-1' || siteLayout === 'amz-template-2'
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

const titleId = 'quick-action-site-hero-banner'

export function SiteHeroBannerQueueModal(): React.ReactElement {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [sites, setSites] = useState<SiteOption[]>([])
  const [sitesLoading, setSitesLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [promptOverride, setPromptOverride] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadSites = useCallback(async () => {
    setSitesLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/article-quick-action/options', {
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
    if (!open) return
    void loadSites()
  }, [open, loadSites])

  const close = (): void => {
    setOpen(false)
    setSites([])
    setSelectedIds([])
    setPromptOverride('')
    setError(null)
    setSuccess(null)
  }

  const toggle = (id: number): void => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const amzSites = sites.filter((s) => isAmzShell(s.siteLayout))

  const submit = async (): Promise<void> => {
    if (selectedIds.length === 0) {
      setError('请选择至少一个 AMZ 布局站点')
      return
    }
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/admin/sites/queue-hero-banner', {
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
      setSuccess(
        `已入队 Together 横幅任务 ${data.queuedCount ?? 0} 条（见「工作流任务」。每次 tick 处理一条）。${skipMsg}`,
      )
      if (typeof window !== 'undefined' && window.location.pathname.includes('/collections/sites')) {
        router.refresh()
      }
      window.setTimeout(() => close(), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button buttonStyle="secondary" onClick={() => setOpen(true)} size="small" type="button">
        Together · 首页横幅
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
              Together · AMZ 首页 Hero 横幅
            </h2>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', opacity: 0.85, lineHeight: 1.55 }}>
              仅列出布局为{' '}
              <code style={{ fontSize: '0.78em' }}>amz-template-1</code> /{' '}
              <code style={{ fontSize: '0.78em' }}>amz-template-2</code> 的站点。将创建{' '}
              <code style={{ fontSize: '0.78em' }}>hero_banner_generate</code>{' '}
              队列任务（需 TOGETHER_API_KEY、pipeline tick）；生成后写入站点「首页 Hero 横幅」并在首页首屏叠加显示。
            </p>

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
                      <span>{formatSiteLine(s)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <span style={fieldLabel}>Together 提示词覆盖（可选）</span>
              <textarea
                placeholder="留空则按站点名、主品、设计中 Hero 文案自动组合"
                rows={4}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                value={promptOverride}
                onChange={(e) => setPromptOverride(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <Button buttonStyle="secondary" disabled={submitting} onClick={() => close()} size="small" type="button">
                取消
              </Button>
              <Button disabled={submitting || amzSites.length === 0} onClick={() => void submit()} size="small">
                {submitting ? '提交中…' : '加入队列'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
