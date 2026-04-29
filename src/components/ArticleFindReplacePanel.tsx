'use client'

import { Button, PopupList } from '@payloadcms/ui'
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import {
  FIND_REPLACE_COLLECTION_FIELDS,
  FIND_REPLACE_FIELD_LABELS,
  type FindReplaceCollectionSlug,
  findReplaceRequiresSite,
  isFindReplaceCollectionSlug,
} from '@/constants/findReplaceCollections'
import {
  getFindReplaceOpen,
  setFindReplaceOpen,
  subscribeFindReplaceOpen,
} from '@/components/findReplaceOpenStore'

type SiteOption = {
  id: number
  name: string
  slug: string
  primaryDomain: string
}

const boxStyle: React.CSSProperties = {
  padding: '0.5rem 0.65rem',
  borderRadius: 4,
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-50)',
  color: 'inherit',
  fontSize: '0.875rem',
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 600,
  opacity: 0.8,
  marginBottom: 4,
  display: 'block',
}

function formatSiteLine(s: SiteOption): string {
  return `${s.name} (${s.slug}) ${s.primaryDomain}`
}

function resolveSlug(collectionSlug: string | undefined): FindReplaceCollectionSlug {
  if (collectionSlug && isFindReplaceCollectionSlug(collectionSlug)) return collectionSlug
  return 'articles'
}

function fieldOptionsFor(slug: FindReplaceCollectionSlug): { value: string; label: string }[] {
  const fields = FIND_REPLACE_COLLECTION_FIELDS[slug]
  const labels = FIND_REPLACE_FIELD_LABELS[slug]
  return fields.map((value) => ({
    value,
    label: labels[value] ?? value,
  }))
}

export type FindReplaceListSlotProps = {
  /** Injected by Payload list view / menu slots. */
  collectionSlug?: string
}

/**
 * 三点菜单项：与 beforeListTable 面板通过 findReplaceOpenStore（按 collectionSlug）同步。
 */
export function FindReplaceListMenuItem(props: FindReplaceListSlotProps): React.ReactElement {
  const slug = resolveSlug(props.collectionSlug)
  const open = useSyncExternalStore(
    (onChange) => subscribeFindReplaceOpen(slug, onChange),
    () => getFindReplaceOpen(slug),
    () => false,
  )
  return (
    <PopupList.Button
      id={`find-replace-menu-${slug}`}
      onClick={() => setFindReplaceOpen(slug, !open)}
    >
      {open ? '关闭查找替换' : '查找替换'}
    </PopupList.Button>
  )
}

/**
 * 列表查找替换：beforeListTable（搜索栏下方），纯文本字段白名单，不含正文富文本。
 */
export function FindReplacePanel(props: FindReplaceListSlotProps): React.ReactElement | null {
  const slug = resolveSlug(props.collectionSlug)
  const needsSite = useMemo(() => findReplaceRequiresSite(slug), [slug])
  const fieldChoices = useMemo(() => fieldOptionsFor(slug), [slug])

  const expanded = useSyncExternalStore(
    (onChange) => subscribeFindReplaceOpen(slug, onChange),
    () => getFindReplaceOpen(slug),
    () => false,
  )

  const [field, setField] = useState(() => fieldChoices[0]?.value ?? 'title')
  useEffect(() => {
    setField(fieldChoices[0]?.value ?? 'title')
  }, [slug, fieldChoices])

  const [siteQuery, setSiteQuery] = useState('')
  const [sites, setSites] = useState<SiteOption[]>([])
  const [sitesLoading, setSitesLoading] = useState(false)
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null)
  const [selectedSiteLabel, setSelectedSiteLabel] = useState('')
  const [siteMenuOpen, setSiteMenuOpen] = useState(false)
  const siteWrapRef = useRef<HTMLDivElement>(null)
  const skipDebRef = useRef(false)

  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')

  const [previewLoading, setPreviewLoading] = useState(false)
  const [execLoading, setExecLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [matchCount, setMatchCount] = useState<number | null>(null)
  const [sample, setSample] = useState<{ id: number; preview: string }[] | null>(null)

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
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载站点失败')
      setSites([])
    } finally {
      setSitesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!expanded || !needsSite || !siteMenuOpen) return
    if (skipDebRef.current) {
      skipDebRef.current = false
      return
    }
    const t = window.setTimeout(() => {
      void loadSites(siteQuery)
    }, 300)
    return (): void => {
      window.clearTimeout(t)
    }
  }, [expanded, needsSite, siteMenuOpen, siteQuery, loadSites])

  useEffect(() => {
    if (!siteMenuOpen) return
    const onDown = (e: MouseEvent): void => {
      const el = siteWrapRef.current
      if (el && !el.contains(e.target as Node)) setSiteMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [siteMenuOpen])

  useEffect(() => {
    if (!expanded || !needsSite) return
    void loadSites('')
  }, [expanded, needsSite, loadSites])

  const runPreview = async (): Promise<void> => {
    if (needsSite && selectedSiteId == null) {
      setError('请选择站点')
      return
    }
    const f = find.trim()
    if (!f) {
      setError('请输入查找文本')
      return
    }
    setPreviewLoading(true)
    setError(null)
    setMatchCount(null)
    setSample(null)
    try {
      const payload: Record<string, unknown> = {
        collection: slug,
        field,
        find: f,
        replace: replace,
        dryRun: true,
      }
      if (needsSite && selectedSiteId != null) {
        payload.siteId = selectedSiteId
      }
      const res = await fetch('/api/admin/collections/find-replace', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        matchCount?: number
        sample?: { id: number; preview: string }[]
      }
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : '预览失败')
      }
      setMatchCount(data.matchCount ?? 0)
      setSample(data.sample ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '预览失败')
    } finally {
      setPreviewLoading(false)
    }
  }

  const runExecute = async (): Promise<void> => {
    if (needsSite && selectedSiteId == null) {
      setError('请选择站点')
      return
    }
    const f = find.trim()
    if (!f) {
      setError('请输入查找文本')
      return
    }
    if (
      !window.confirm(
        `将替换约 ${matchCount ?? '若干'} 条匹配（以预览为准）。确定执行吗？`,
      )
    ) {
      return
    }
    setExecLoading(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        collection: slug,
        field,
        find: f,
        replace: replace,
        dryRun: false,
      }
      if (needsSite && selectedSiteId != null) {
        payload.siteId = selectedSiteId
      }
      const res = await fetch('/api/admin/collections/find-replace', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; updatedCount?: number }
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : '替换失败')
      }
      window.alert(`已更新 ${data.updatedCount ?? 0} 条文档`)
      setMatchCount(null)
      setSample(null)
      void runPreview()
    } catch (e) {
      setError(e instanceof Error ? e.message : '替换失败')
    } finally {
      setExecLoading(false)
    }
  }

  if (!expanded) {
    return null
  }

  const closePanel = (): void => {
    setFindReplaceOpen(slug, false)
    setError(null)
    setMatchCount(null)
    setSample(null)
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div
        style={{
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: 8,
          padding: '0.75rem 1rem',
          background: 'var(--theme-elevation-50)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '0.75rem',
            gap: '0.5rem',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>查找替换</span>
          <Button buttonStyle="transparent" onClick={closePanel} size="small" type="button">
            关闭查找替换
          </Button>
        </div>

        {error ? (
          <p style={{ color: 'var(--theme-error-500)', fontSize: '0.8125rem', marginBottom: '0.5rem' }}>
            {error}
          </p>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.65rem',
            alignItems: 'end',
            marginBottom: '0.65rem',
          }}
        >
          {needsSite ? (
            <div ref={siteWrapRef} style={{ position: 'relative', minWidth: 0 }}>
              <span style={labelStyle}>站点</span>
              <button
                aria-expanded={siteMenuOpen}
                style={{
                  ...boxStyle,
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                type="button"
                onClick={() => {
                  setSiteMenuOpen((prev) => {
                    const next = !prev
                    if (next) {
                      skipDebRef.current = true
                      void loadSites(siteQuery)
                    }
                    return next
                  })
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedSiteId == null ? '请选择站点' : selectedSiteLabel}
                </span>
                <span aria-hidden style={{ opacity: 0.6, fontSize: '0.65rem' }}>
                  {siteMenuOpen ? '▲' : '▼'}
                </span>
              </button>
              {siteMenuOpen ? (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: '100%',
                    marginTop: 4,
                    zIndex: 20,
                    borderRadius: 6,
                    border: '1px solid var(--theme-elevation-150)',
                    background: 'var(--theme-elevation-0)',
                    padding: '0.5rem',
                    maxHeight: 240,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                  }}
                >
                  <input
                    placeholder="输入名称、slug 或域名筛选…"
                    style={{ ...boxStyle, width: '100%', marginBottom: 8 }}
                    type="search"
                    value={siteQuery}
                    onChange={(e) => setSiteQuery(e.target.value)}
                  />
                  <div style={{ maxHeight: 160, overflow: 'auto' }}>
                    <button
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.35rem',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                      }}
                      type="button"
                      onClick={() => {
                        setSelectedSiteId(null)
                        setSelectedSiteLabel('')
                        setSiteQuery('')
                      }}
                    >
                      清空选择
                    </button>
                    {sitesLoading ? (
                      <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>加载中…</span>
                    ) : (
                      sites.map((s) => (
                        <button
                          key={s.id}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '0.35rem',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                          }}
                          type="button"
                          onClick={() => {
                            setSelectedSiteId(s.id)
                            setSelectedSiteLabel(formatSiteLine(s))
                            setSiteMenuOpen(false)
                            setSiteQuery('')
                          }}
                        >
                          {formatSiteLine(s)}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div>
            <span style={labelStyle}>字段</span>
            <select
              style={{ ...boxStyle, width: '100%' }}
              value={field}
              onChange={(e) => setField(e.target.value)}
            >
              {fieldChoices.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span style={labelStyle}>查找</span>
            <input
              placeholder="查找文本"
              style={{ ...boxStyle, width: '100%' }}
              value={find}
              onChange={(e) => setFind(e.target.value)}
            />
          </div>

          <div>
            <span style={labelStyle}>替换为</span>
            <input
              placeholder="替换文本（可空）"
              style={{ ...boxStyle, width: '100%' }}
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
            />
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              disabled={previewLoading || execLoading}
              onClick={() => void runPreview()}
              size="small"
              type="button"
            >
              {previewLoading ? '预览中…' : '预览匹配'}
            </Button>
            <Button
              buttonStyle="secondary"
              disabled={previewLoading || execLoading}
              onClick={() => void runExecute()}
              size="small"
              type="button"
            >
              {execLoading ? '执行中…' : '执行替换'}
            </Button>
          </div>
          <span style={{ fontSize: '0.7rem', opacity: 0.65 }}>
            {slug === 'media'
              ? '仅替换替代文本（alt）；范围限于当前账号可访问租户内的媒体'
              : '仅纯文本字段，不含正文富文本'}
          </span>
        </div>

        {matchCount != null ? (
          <p style={{ margin: '0.65rem 0 0', fontSize: '0.8125rem' }}>
            匹配约 <strong>{matchCount}</strong> 条
          </p>
        ) : null}
        {sample != null && sample.length > 0 ? (
          <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem', fontSize: '0.75rem', opacity: 0.9 }}>
            {sample.slice(0, 8).map((s) => (
              <li key={s.id} style={{ marginBottom: 4 }}>
                #{s.id} — {s.preview}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

/** @deprecated Use {@link FindReplacePanel} */
export const ArticleFindReplacePanel = FindReplacePanel
/** @deprecated Use {@link FindReplaceListMenuItem} */
export const ArticleFindReplaceListMenuItem = FindReplaceListMenuItem
