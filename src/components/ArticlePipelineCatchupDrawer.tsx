'use client'

import { Button } from '@payloadcms/ui'
import React, { useState } from 'react'

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

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.65rem',
  borderRadius: 4,
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-50)',
  color: 'inherit',
  fontSize: '0.875rem',
}

/**
 * Enqueue missing pipeline jobs (draft_section → draft_finalize → image) for an article with `sourceBrief`.
 */
export function ArticlePipelineCatchupDrawer(): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [articleId, setArticleId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultLines, setResultLines] = useState<string[]>([])

  function close(): void {
    setOpen(false)
    setError(null)
    setResultLines([])
  }

  async function submit(): Promise<void> {
    const id = articleId.trim()
    if (!id || !/^\d+$/.test(id)) {
      setError('请输入文章 ID（数字）')
      return
    }
    setBusy(true)
    setError(null)
    setResultLines([])
    try {
      const res = await fetch(`/api/admin/articles/${id}/pipeline-catchup`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        messages?: string[]
      }
      if (!res.ok || data.ok === false) {
        throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
      }
      setResultLines(Array.isArray(data.messages) ? data.messages : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败')
    } finally {
      setBusy(false)
    }
  }

  const titleId = 'article-pipeline-catchup-title'

  return (
    <>
      <Button buttonStyle="secondary" onClick={() => setOpen(true)} type="button">
        补足 Brief 后链路 · 文章
      </Button>
      {open ? (
        <>
          <button
            aria-label="关闭"
            type="button"
            style={{
              ...backdropStyle,
              cursor: 'pointer',
              border: 'none',
              appearance: 'none',
            }}
            onClick={close}
          />
          <div style={{ ...backdropStyle, pointerEvents: 'none' }}>
            <div
              aria-labelledby={titleId}
              role="dialog"
              style={{ ...panelStyle, pointerEvents: 'auto' }}
              onClick={(ev) => ev.stopPropagation()}
              onKeyDown={(ev) => {
                if (ev.key === 'Escape') close()
              }}
            >
              <h2 id={titleId} style={{ margin: '0 0 0.75rem', fontSize: '1.125rem', fontWeight: 600 }}>
                补齐 draft_section → finalize → 配图
              </h2>
              <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', opacity: 0.85, lineHeight: 1.5 }}>
                仅限已关联「内容大纲 / sourceBrief」、且仍为草稿的文章。对已漏跑或失败的任务会按状态补入队列；发布仍需人工填写
                Author。
              </p>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                文章 ID
              </label>
              <input
                aria-label="文章 ID"
                inputMode="numeric"
                placeholder="articles.id"
                style={inputStyle}
                value={articleId}
                onChange={(e) => setArticleId(e.target.value)}
              />
              {error ? (
                <p style={{ marginTop: '0.65rem', color: 'var(--theme-error-500)', fontSize: '0.8125rem' }}>
                  {error}
                </p>
              ) : null}
              {resultLines.length > 0 ? (
                <ul
                  style={{
                    marginTop: '0.65rem',
                    paddingLeft: '1.1rem',
                    fontSize: '0.8125rem',
                    opacity: 0.9,
                  }}
                >
                  {resultLines.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              ) : null}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                <Button disabled={busy} onClick={() => void submit()} type="button">
                  补缺并入队
                </Button>
                <Button buttonStyle="secondary" disabled={busy} onClick={close} type="button">
                  关闭
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  )
}
