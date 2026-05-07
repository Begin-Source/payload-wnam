'use client'

import { Button, useSelection } from '@payloadcms/ui'
import { SelectAllStatus } from '@payloadcms/ui/providers/Selection'
import React, { useCallback, useEffect, useState } from 'react'

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
  width: 'min(48rem, 100%)',
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

type PeekResp = {
  ok?: boolean
  error?: string
  pending?: number
  byType?: Record<string, number>
  byTypeTruncated?: boolean
  scope?: 'global' | 'selected'
  requestedJobIdsCount?: number
  constrainedJobIdsTruncated?: boolean
}

type RunResp = {
  ok?: boolean
  totalRuns?: number
  runs?: Array<{
    jobId?: string | number | null
    jobType?: string | null
    result?: string | null
    httpStatus?: number
    durationMs?: number
    errorMessage?: string
  }>
  stoppedReason?: string
  message?: string
  requestedJobIdsCount?: number
  allowedJobIdsCount?: number
  constrainedJobIdsTruncated?: boolean
}

function formatByType(byType: Record<string, number> | undefined): string {
  if (!byType || Object.keys(byType).length === 0) return '—'
  return Object.entries(byType)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(', ')
}

function truncate120(s: string | undefined): string {
  if (s == null || s === '') return '—'
  return s.length <= 120 ? s : `${s.slice(0, 120)}…`
}

const MSG_PEEK_FORBIDDEN =
  '无权限：仅「普通 user」角色的账号不能查看待执行队列或执行 Pipeline Tick。请在 Users 中为该账号至少勾选一项后台角色（如站长、组长、运营经理、财务、总经理、系统管理员、超级管理员等）后重试。'

const MSG_PEEK_UNAUTHORIZED = '未登录或会话已失效，请重新登录后台后再试。'

function mapRunNextHttpError(res: Response, bodyError: string | undefined): string {
  if (res.status === 403) return MSG_PEEK_FORBIDDEN
  if (res.status === 401) return MSG_PEEK_UNAUTHORIZED
  return typeof bodyError === 'string' ? bodyError : `请求失败（HTTP ${res.status}）`
}

/** Workflow jobs list: peek pending queue + run up to N `/api/pipeline/tick` (server-side secret). */
export function PipelineRunNextDrawer(): React.ReactElement {
  const { count, getSelectedIds, selectedIDs, selectAll } = useSelection()

  const [open, setOpen] = useState(false)
  const [peek, setPeek] = useState<PeekResp | null>(null)
  const [peekLoading, setPeekLoading] = useState(false)
  const [maxRuns, setMaxRuns] = useState('8')
  const [budgetSeconds, setBudgetSeconds] = useState('25')
  const [stopOnFailure, setStopOnFailure] = useState(true)
  const [runSelectedOnly, setRunSelectedOnly] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRun, setLastRun] = useState<RunResp | null>(null)

  const selectAllBlocksSelection = selectAll === SelectAllStatus.AllAvailable
  const hasRowSelection = (count ?? 0) > 0 || selectedIDs.length > 0
  const canOfferSelectedMode = hasRowSelection && !selectAllBlocksSelection
  const effectiveSelectedOnly = runSelectedOnly && canOfferSelectedMode
  const selectedCountLabel = Math.max(count ?? 0, selectedIDs.length)

  useEffect(() => {
    if (selectAllBlocksSelection && runSelectedOnly) {
      setRunSelectedOnly(false)
    }
  }, [selectAllBlocksSelection, runSelectedOnly])

  useEffect(() => {
    if (runSelectedOnly && !hasRowSelection) {
      setRunSelectedOnly(false)
    }
  }, [runSelectedOnly, hasRowSelection])

  const refreshPeek = useCallback(async (): Promise<void> => {
    setPeekLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (
        runSelectedOnly &&
        selectAll !== SelectAllStatus.AllAvailable
      ) {
        const ids = getSelectedIds()
        const sortedKey = [...ids]
          .sort((a, b) => String(a).localeCompare(String(b)))
          .join(',')
        if (sortedKey.length > 0) {
          params.set('ids', sortedKey)
        }
      }
      const qs = params.toString()
      const res = await fetch(`/api/admin/pipeline/run-next${qs ? `?${qs}` : ''}`, {
        credentials: 'include',
      })
      const data = (await res.json().catch(() => ({}))) as PeekResp

      if (res.status === 403) {
        setPeek(null)
        setError(MSG_PEEK_FORBIDDEN)
        return
      }
      if (res.status === 401) {
        setPeek(null)
        setError(MSG_PEEK_UNAUTHORIZED)
        return
      }
      if (!res.ok || data.ok === false) {
        setPeek(null)
        setError(
          typeof data.error === 'string' ? data.error : `加载队列失败（HTTP ${res.status}）`,
        )
        return
      }
      setPeek(data)
      setError(null)
    } catch (e) {
      setPeek(null)
      setError(e instanceof Error ? e.message : '加载队列失败')
    } finally {
      setPeekLoading(false)
    }
  }, [runSelectedOnly, selectAll, getSelectedIds])

  useEffect(() => {
    if (!open) return
    void refreshPeek()
  }, [open, refreshPeek])

  const close = (): void => {
    setOpen(false)
    setLastRun(null)
    setError(null)
  }

  async function execute(): Promise<void> {
    setSubmitting(true)
    setError(null)
    try {
      const mr = Number.parseInt(maxRuns, 10)
      const bs = Number.parseFloat(budgetSeconds)
      if (!Number.isFinite(mr) || mr < 1 || mr > 20) {
        setError('maxRuns 须为 1–20（默认 8 便于 Brief→多段正文→finalize→配图）')
        setSubmitting(false)
        return
      }
      if (!Number.isFinite(bs) || bs < 3 || bs > 55) {
        setError('时间预算（秒）须为 3–55')
        setSubmitting(false)
        return
      }

      const jobIdsPayload =
        runSelectedOnly && selectAll !== SelectAllStatus.AllAvailable
          ? (() => {
              const ids = getSelectedIds()
              return ids.length > 0 ? { jobIds: [...ids] } : {}
            })()
          : {}

      const res = await fetch('/api/admin/pipeline/run-next', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxRuns: mr,
          budgetMs: Math.round(bs * 1000),
          stopOnFailure,
          ...jobIdsPayload,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as RunResp
      if (!res.ok) {
        const errBody = data as unknown as { error?: string }
        throw new Error(mapRunNextHttpError(res, errBody.error))
      }
      setLastRun(data)
      await refreshPeek()
    } catch (e) {
      setError(e instanceof Error ? e.message : '执行失败')
    } finally {
      setSubmitting(false)
    }
  }

  const tickBlockedByAuth =
    Boolean(error) &&
    (error === MSG_PEEK_FORBIDDEN ||
      error === MSG_PEEK_UNAUTHORIZED ||
      error.startsWith('无权限：') ||
      error.startsWith('未登录'))

  const titleId = 'pipeline-run-next-title'

  return (
    <>
      <Button buttonStyle="secondary" onClick={() => setOpen(true)} type="button">
        执行排队任务 · Pipeline
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
                执行下 N 条工作流 · Tick
              </h2>
              <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', opacity: 0.85, lineHeight: 1.5 }}>
                按创建时间从早到晚依次执行 <code>pending</code> 任务（仅勾选模式下：仅在你勾选且<strong>仍可访问</strong>的 ID 中取最早创建的一条）。勾选顺序不参与排序。一次{' '}
                <code>brief_generate</code> 成功后会自动入队 <code>draft_skeleton</code>，因此 N=5 大约覆盖 2–3 组「Brief + 骨架」链路。
              </p>

              {selectAllBlocksSelection ? (
                <p
                  style={{
                    margin: '0 0 0.75rem',
                    fontSize: '0.8125rem',
                    color: 'var(--theme-warning-600)',
                    lineHeight: 1.5,
                  }}
                >
                  当前为「全选所有结果」：无法把全部匹配行收敛为 ID 列表。请取消该全选，或改为逐页勾选后使用「仅执行已勾选」；否则请关闭该选项，使用全局待执行队列。
                </p>
              ) : null}

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  marginBottom: '0.75rem',
                  cursor: canOfferSelectedMode ? 'pointer' : 'not-allowed',
                  opacity: canOfferSelectedMode ? 1 : 0.55,
                }}
              >
                <input
                  type="checkbox"
                  checked={effectiveSelectedOnly}
                  disabled={!canOfferSelectedMode}
                  onChange={(e) => setRunSelectedOnly(e.target.checked)}
                />
                <span style={{ fontSize: '0.8125rem', lineHeight: 1.45 }}>
                  仅执行已勾选的任务
                  {canOfferSelectedMode
                    ? `（${selectedCountLabel} 条已选）`
                    : '（请先在列表中勾选行）'}
                </span>
              </label>

              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.65rem',
                  borderRadius: 4,
                  background: 'var(--theme-elevation-50)',
                  fontSize: '0.8125rem',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                  <strong>待执行队列</strong>
                  {effectiveSelectedOnly ? (
                    <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>（仅已勾选 ID 范围）</span>
                  ) : null}
                  {peekLoading ? (
                    <span style={{ opacity: 0.8 }}>加载中…</span>
                  ) : peek != null ? (
                    <>
                      <span>
                        {peek.pending ?? 0} 条
                        {peek.byTypeTruncated ? '（类型分布至多统计前 2000 条）' : ''}
                      </span>
                      <Button
                        buttonStyle="secondary"
                        disabled={peekLoading || submitting}
                        onClick={() => void refreshPeek()}
                        type="button"
                      >
                        刷新
                      </Button>
                    </>
                  ) : (
                    <>
                      <span style={{ color: 'var(--theme-error-500)' }}>
                        {tickBlockedByAuth ? '无权限统计 pending 条数' : '加载失败（非 0；见下方说明）'}
                      </span>
                      <Button
                        buttonStyle="secondary"
                        disabled={peekLoading || submitting}
                        onClick={() => void refreshPeek()}
                        type="button"
                      >
                        刷新
                      </Button>
                    </>
                  )}
                </div>
                {!peekLoading && peek != null && effectiveSelectedOnly && peek.requestedJobIdsCount != null ? (
                  <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', opacity: 0.88 }}>
                    已选 <code>{peek.requestedJobIdsCount}</code> 个 id；其中当前为 pending 且可见约 <code>{peek.pending ?? 0}</code> 条
                    {peek.constrainedJobIdsTruncated ? '（id 列表已截断至多 500 条）' : ''}
                  </div>
                ) : null}
                {!peekLoading && peek?.byType != null ? (
                  <div style={{ marginTop: '0.35rem', opacity: 0.9 }}>
                    {formatByType(peek.byType)}
                  </div>
                ) : null}
              </div>

              {error ? (
                <p style={{ color: 'var(--theme-error-500)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
                  {error}
                </p>
              ) : null}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.65rem',
                  marginBottom: '0.75rem',
                }}
              >
                <div>
                  <label style={fieldLabel}>本次最多执行几条（tick 次数）</label>
                  <input
                    style={inputStyle}
                    inputMode="numeric"
                    min={1}
                    max={20}
                    value={maxRuns}
                    onChange={(e) => setMaxRuns(e.target.value)}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>时间预算（秒，3–55）</label>
                  <input
                    style={inputStyle}
                    inputMode="decimal"
                    min={3}
                    max={55}
                    value={budgetSeconds}
                    onChange={(e) => setBudgetSeconds(e.target.value)}
                  />
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
                <input
                  type="checkbox"
                  checked={stopOnFailure}
                  onChange={(e) => setStopOnFailure(e.target.checked)}
                />
                <span style={{ fontSize: '0.8125rem' }}>遇失败即停止（默认开启）</span>
              </label>

              {lastRun?.message ? (
                <p style={{ fontSize: '0.8125rem', marginBottom: '0.75rem', opacity: 0.9, lineHeight: 1.45 }}>
                  {lastRun.message}
                  {lastRun.requestedJobIdsCount != null && lastRun.allowedJobIdsCount != null
                    ? `（请求 id 数 ${lastRun.requestedJobIdsCount} · 可执行 pending ${lastRun.allowedJobIdsCount}）`
                    : ''}
                  {lastRun.constrainedJobIdsTruncated ? ' id 列表已截断。' : ''}
                </p>
              ) : null}

              {lastRun?.runs != null && lastRun.runs.length > 0 ? (
                <div style={{ marginBottom: '1rem', overflowX: 'auto' }}>
                  <p style={{ fontSize: '0.8125rem', marginBottom: '0.5rem', opacity: 0.9 }}>
                    本轮结果：<code>{lastRun.stoppedReason ?? '—'}</code>，共 {lastRun.totalRuns ?? lastRun.runs.length}{' '}
                    次 tick，ok={String(lastRun.ok ?? false)}
                    {lastRun.requestedJobIdsCount != null && lastRun.allowedJobIdsCount != null
                      ? ` · 勾选 id ${lastRun.requestedJobIdsCount} · 服务端认可 pending ${lastRun.allowedJobIdsCount}`
                      : ''}
                  </p>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '0.75rem',
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--theme-elevation-150)' }}>
                        <th style={{ textAlign: 'left', padding: '0.35rem' }}>#</th>
                        <th style={{ textAlign: 'left', padding: '0.35rem' }}>jobId</th>
                        <th style={{ textAlign: 'left', padding: '0.35rem' }}>类型</th>
                        <th style={{ textAlign: 'left', padding: '0.35rem' }}>result</th>
                        <th style={{ textAlign: 'left', padding: '0.35rem' }}>HTTP</th>
                        <th style={{ textAlign: 'left', padding: '0.35rem' }}>ms</th>
                        <th style={{ textAlign: 'left', padding: '0.35rem' }}>错误</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastRun.runs.map((r, idx) => (
                        <tr
                          key={`${idx}-${String(r.jobId ?? '')}-${String(r.durationMs ?? '')}`}
                          style={{ borderBottom: '1px solid var(--theme-elevation-100)' }}
                        >
                          <td style={{ padding: '0.35rem' }}>{idx + 1}</td>
                          <td style={{ padding: '0.35rem' }}>{r.jobId != null ? String(r.jobId) : '—'}</td>
                          <td style={{ padding: '0.35rem' }}>{r.jobType ?? '—'}</td>
                          <td style={{ padding: '0.35rem' }}>{r.result ?? '—'}</td>
                          <td style={{ padding: '0.35rem' }}>{r.httpStatus ?? '—'}</td>
                          <td style={{ padding: '0.35rem' }}>{r.durationMs ?? '—'}</td>
                          <td style={{ padding: '0.35rem' }}>{truncate120(r.errorMessage)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Button disabled={submitting || tickBlockedByAuth} onClick={() => void execute()} type="button">
                  执行下 N 条
                </Button>
                <Button buttonStyle="secondary" disabled={submitting} onClick={close} type="button">
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
