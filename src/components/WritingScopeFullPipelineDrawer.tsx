'use client'

import { useAdminBackgroundActivity } from '@/components/adminBackgroundActivity/AdminBackgroundActivityProvider'

import { Button, useSelection } from '@payloadcms/ui'
import { SelectAllStatus } from '@payloadcms/ui/providers/Selection'
import { usePathname } from 'next/navigation'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import {
  MAX_PIPELINE_DRAIN_BATCHES,
  nextScopedPipelineDrainBatchAction,
} from '@/utilities/pipelineRunNextDrain'

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

type ScopedRunResp = {
  ok?: boolean
  error?: string
  errorCode?: string
  errorDetail?: string
  failureSummary?: string
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
  scopeDone?: boolean
  scopePendingCountBefore?: number
  scopePendingCountAfter?: number
  requestedArticleId?: number | null
  requestedBriefId?: number | null
  /** 脱敏 tick 排查摘要（`debugBanner` 开启时） */
  bannerHints?: string[]
  /** 零 pending 时服务端尝试入队骨架或 catchup 的说明 */
  bootstrapSummary?: string[]
  bootstrapAttempted?: boolean
}

const MSG_PEEK_FORBIDDEN =
  '无权限：仅「普通 user」角色的账号不能执行 Pipeline Tick。请在 Users 中为该账号至少勾选一项后台角色后重试。'

const MSG_PEEK_UNAUTHORIZED = '未登录或会话已失效，请重新登录后台后再试。'

async function readAdminJsonResponse<T extends Record<string, unknown>>(
  res: Response,
): Promise<
  T & {
    error?: string
    errorCode?: string
    errorDetail?: string
    ok?: boolean
  }
> {
  const text = await res.text()
  if (!text.trim()) {
    return {} as T & { error?: string; errorCode?: string; errorDetail?: string; ok?: boolean }
  }
  try {
    return JSON.parse(text) as T & {
      error?: string
      errorCode?: string
      errorDetail?: string
      ok?: boolean
    }
  } catch {
    return {
      error: `响应非 JSON（HTTP ${res.status}）`,
      errorCode: 'non_json_response',
      errorDetail: text.slice(0, 280),
    } as T & { error?: string; errorCode?: string; errorDetail?: string; ok?: boolean }
  }
}

function formatPipelineHttpFailure(
  res: Response,
  data: { error?: string; errorCode?: string; errorDetail?: string },
): string {
  if (res.status === 403) return MSG_PEEK_FORBIDDEN
  if (res.status === 401) return MSG_PEEK_UNAUTHORIZED

  const cfRay = res.headers.get('cf-ray')
  const raySuffix = cfRay ? ` · cf-ray: ${cfRay}` : ''

  const base =
    typeof data.error === 'string' && data.error.trim()
      ? data.error.trim()
      : res.status === 503 || res.status === 502 || res.status === 504
        ? `网关或边缘不可用（HTTP ${res.status}）`
        : `请求失败（HTTP ${res.status}）`

  const code =
    typeof data.errorCode === 'string' && data.errorCode.trim()
      ? ` [${data.errorCode.trim()}]`
      : ''

  const detail =
    typeof data.errorDetail === 'string' && data.errorDetail.trim()
      ? ` — ${data.errorDetail.trim().slice(0, 450)}`
      : ''

  const edgeHint =
    res.status === 503 || res.status === 504
      ? '。若在 Cloudflare：请将「本次最多执行几条」设为较小值，由本工具自动多轮短请求。'
      : ''

  return `${base}${code}${detail}${raySuffix}${edgeHint}`
}

function countTickRowFailures(data: ScopedRunResp): number {
  const runs = data.runs
  if (!Array.isArray(runs)) return 0
  return runs.filter((r) => r.result === 'failed').length
}

function normalizeSelectedIdArray(raw: unknown[]): number[] {
  const nums = new Set<number>()
  for (const x of raw) {
    const n = typeof x === 'number' ? x : typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : NaN
    if (Number.isFinite(n) && n > 0) nums.add(Math.floor(n))
  }
  return [...nums].sort((a, b) => a - b)
}

export type WritingScopeFullPipelineDrawerProps = {
  open: boolean
  onClose: () => void
}

/**
 * Controlled modal: drain writing-pipeline pending for one brief/article; targets from list selection + optional manual IDs.
 */
export function WritingScopeFullPipelineDrawer({
  open,
  onClose,
}: WritingScopeFullPipelineDrawerProps): React.ReactElement {
  const pathname = usePathname() ?? ''
  const { getSelectedIds, selectAll, selectedIDs } = useSelection()

  const listKind = useMemo(() => {
    if (pathname.includes('content-briefs')) return 'briefs' as const
    if (pathname.includes('/articles') || pathname.includes('collections/articles')) {
      return 'articles' as const
    }
    return 'unknown' as const
  }, [pathname])

  const {
    startWorkflowJobsPipelineJob,
    updateWorkflowJobsPipelineJobProgress,
    completeWorkflowJobsPipelineJob,
    failWorkflowJobsPipelineJob,
  } = useAdminBackgroundActivity()

  const selectAllBlocksSelection = selectAll === SelectAllStatus.AllAvailable
  const selectedRowIds = useMemo(() => {
    const raw =
      selectedIDs.length > 0 ? [...selectedIDs] : ([...getSelectedIds()] as unknown[])
    return normalizeSelectedIdArray(raw)
  }, [selectedIDs, getSelectedIds, selectAll])

  const [pickedId, setPickedId] = useState<string>('')
  const [labelsById, setLabelsById] = useState<Record<number, string>>({})
  const [labelsLoading, setLabelsLoading] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [articleId, setArticleId] = useState('')
  const [briefId, setBriefId] = useState('')
  const [maxRuns, setMaxRuns] = useState('8')
  const [budgetSeconds, setBudgetSeconds] = useState('25')
  const [stopOnFailure, setStopOnFailure] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const canUseRowPicker =
    !selectAllBlocksSelection &&
    selectedRowIds.length > 0 &&
    (listKind === 'briefs' || listKind === 'articles')

  const loadLabels = useCallback(async (): Promise<void> => {
    if (!canUseRowPicker || selectedRowIds.length === 0) {
      setLabelsById({})
      return
    }
    const qs = new URLSearchParams()
    if (listKind === 'briefs') {
      qs.set('briefIds', selectedRowIds.join(','))
    } else {
      qs.set('articleIds', selectedRowIds.join(','))
    }
    setLabelsLoading(true)
    try {
      const res = await fetch(`/api/admin/pipeline/writing-scope-labels?${qs}`, {
        credentials: 'include',
      })
      const data = await readAdminJsonResponse<{
        ok?: boolean
        briefs?: { id: number; title: string }[]
        articles?: { id: number; title: string }[]
      }>(res)
      if (!res.ok || data.ok === false) {
        return
      }
      const next: Record<number, string> = {}
      const rows = listKind === 'briefs' ? data.briefs ?? [] : data.articles ?? []
      for (const r of rows) {
        if (Number.isFinite(r.id)) next[r.id] = r.title
      }
      setLabelsById(next)
    } finally {
      setLabelsLoading(false)
    }
  }, [canUseRowPicker, listKind, selectedRowIds])

  useEffect(() => {
    if (!open) return
    setError(null)
    void loadLabels()
  }, [open, loadLabels])

  useEffect(() => {
    if (!open) return
    if (!canUseRowPicker) {
      setPickedId('')
      return
    }
    if (selectedRowIds.length === 1) {
      setPickedId(String(selectedRowIds[0]))
      return
    }
    setPickedId((prev) => {
      if (prev && selectedRowIds.includes(Number(prev))) return prev
      return ''
    })
  }, [open, canUseRowPicker, selectedRowIds])

  useEffect(() => {
    if (!open) {
      setShowManual(false)
    }
  }, [open])

  function close(): void {
    onClose()
    setError(null)
  }

  function submitExecute(): void {
    let aNum: number | undefined
    let bNum: number | undefined

    if (showManual) {
      const aRaw = articleId.trim()
      const bRaw = briefId.trim()
      const a = aRaw ? Number(aRaw) : NaN
      const b = bRaw ? Number(bRaw) : NaN
      if ((!aRaw && !bRaw) || (aRaw && !Number.isFinite(a)) || (bRaw && !Number.isFinite(b))) {
        setError('手动输入：请填写有效的文章 ID 和/或内容大纲 ID（至少一项）')
        return
      }
      if (aRaw && Number.isFinite(a)) aNum = Math.floor(a)
      if (bRaw && Number.isFinite(b)) bNum = Math.floor(b)
    } else {
      if (canUseRowPicker && pickedId) {
        const id = Number(pickedId)
        if (!Number.isFinite(id)) {
          setError('请从下拉中选择一条')
          return
        }
        if (listKind === 'briefs') {
          bNum = Math.floor(id)
        } else if (listKind === 'articles') {
          aNum = Math.floor(id)
        } else {
          setError('当前页面无法识别列表类型，请展开「手动输入 ID」')
          return
        }
      } else {
        setError(
          selectAllBlocksSelection
            ? '当前为「全选所有结果」，无法列出 ID。请取消该全选、改为勾选具体行，或展开「手动输入 ID」。'
            : canUseRowPicker
              ? '请从下拉中选择一条要跑通流水线的文档'
              : '请先在列表中勾选一行，或展开「手动输入 ID」。',
        )
        return
      }
    }

    if (aNum == null && bNum == null) {
      setError('未解析到文章或大纲 ID')
      return
    }

    const mr = Number.parseInt(maxRuns, 10)
    const bs = Number.parseFloat(budgetSeconds)
    if (!Number.isFinite(mr) || mr < 1 || mr > 20) {
      setError('maxRuns 须为 1–20')
      return
    }
    if (!Number.isFinite(bs) || bs < 3 || bs > 55) {
      setError('时间预算（秒）须为 3–55')
      return
    }

    const body = {
      maxRuns: mr,
      budgetMs: Math.round(bs * 1000),
      stopOnFailure,
      debugBanner: true,
      ...(aNum != null ? { articleId: aNum } : {}),
      ...(bNum != null ? { briefId: bNum } : {}),
    }

    const parts: string[] = []
    if (aNum != null) parts.push(`文章 #${aNum}`)
    if (bNum != null) parts.push(`大纲 #${bNum}`)
    const scopeHint = `${parts.join(' · ')} · 一键写作流水线`

    const jobId = startWorkflowJobsPipelineJob({ scopeHint })
    onClose()
    setError(null)

    void (async () => {
      let batches = 0
      let totalTicks = 0
      let tickFailures = 0
      let allBatchesOk = true
      let lastData: ScopedRunResp | null = null

      try {
        while (true) {
          batches += 1
          const res = await fetch('/api/admin/pipeline/run-scoped-batch', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          const data = await readAdminJsonResponse<ScopedRunResp>(res)
          lastData = data

          if (!res.ok) {
            throw new Error(formatPipelineHttpFailure(res, data))
          }

          tickFailures += countTickRowFailures(data)
          if (data.ok === false) allBatchesOk = false

          totalTicks += data.totalRuns ?? data.runs?.length ?? 0
          const hintRaw = Array.isArray(data.bannerHints) ? data.bannerHints : []
          const bootLines = Array.isArray(data.bootstrapSummary) ? data.bootstrapSummary : []
          const debugAppend = [
            ...bootLines.map((s) => `[批 ${batches}] bootstrap: ${s}`),
            ...hintRaw.map((h) => `[批 ${batches}] ${h}`),
          ]
          updateWorkflowJobsPipelineJobProgress({
            jobId,
            batches,
            totalTicks,
            ...(debugAppend.length > 0 ? { debugLinesAppend: debugAppend } : {}),
          })

          const action = nextScopedPipelineDrainBatchAction({
            httpOk: true,
            bodyOk: data.ok,
            stoppedReason: data.stoppedReason,
            scopeDone: data.scopeDone,
            batchesCompleted: batches,
          })

          if (action === 'stop_ok') {
            break
          }
          if (action === 'stop_error') {
            const cappedHit =
              batches >= MAX_PIPELINE_DRAIN_BATCHES &&
              (data.stoppedReason === 'budget' ||
                data.stoppedReason === 'max_runs' ||
                (data.stoppedReason === 'no_pending' && data.scopeDone === false))

            const failureLine =
              typeof data.failureSummary === 'string' && data.failureSummary.trim()
                ? data.failureSummary.trim()
                : ''

            const hint = cappedHit
              ? `已达分批上限 ${MAX_PIPELINE_DRAIN_BATCHES} 轮，作用域内可能仍有 pending。`
              : data.ok === false ||
                  data.stoppedReason === 'failure' ||
                  data.stoppedReason === 'aborted'
                ? '执行已停止（失败或中止）。'
                : '执行已停止。'

            completeWorkflowJobsPipelineJob({
              jobId,
              summary: {
                batches,
                totalTicks,
                stoppedReason: data.stoppedReason,
                scope: 'selected',
                drainMode: true,
                overallOk: false,
                cappedByMaxBatches: cappedHit,
                tickFailures,
                errorHint: [hint, failureLine].filter(Boolean).join(' '),
                ...(failureLine ? { failureSummary: failureLine } : {}),
              },
            })
            return
          }
        }

        const final = lastData
        const failSummary =
          typeof final?.failureSummary === 'string' && final.failureSummary.trim()
            ? final.failureSummary.trim()
            : ''

        completeWorkflowJobsPipelineJob({
          jobId,
          summary: {
            batches,
            totalTicks,
            stoppedReason: final?.stoppedReason,
            scope: 'selected',
            drainMode: true,
            overallOk: allBatchesOk && tickFailures === 0,
            tickFailures,
            ...(failSummary ? { failureSummary: failSummary } : {}),
          },
        })
      } catch (e) {
        failWorkflowJobsPipelineJob({
          jobId,
          message: e instanceof Error ? e.message : '执行失败',
        })
      }
    })()
  }

  const titleId = 'writing-scope-full-pipeline-title'
  const pickerLabel =
    listKind === 'briefs' ? '从已勾选大纲中选择' : listKind === 'articles' ? '从已勾选文章中选择' : '列表选择（当前页类型未知）'

  return (
    <>
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
                按文章 / 大纲作用域执行至无 pending
              </h2>
              <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', opacity: 0.85, lineHeight: 1.5 }}>
                每轮由服务端重新查询该作用域内 <code>pending</code> 的写作链路任务并 Tick，多轮短请求直至队列空或失败。进度在 Admin
                顶栏 Banner。在列表中<strong>勾选一行或多行</strong>后，从下拉选择目标；或使用下方手动输入。
                <strong>若当前无任何 pending</strong>，会先试自动补缺：有大纲但尚无文章则入队
                <code>draft_skeleton</code>；若已有文章则执行与「pipeline catchup」相同的补段/收尾入队。不会对该大纲再跑
                <code>brief_generate</code>（避免新建重复大纲行）。
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
                  当前为「全选所有结果」：无法把全部匹配行收敛为 ID。请取消该全选并勾选具体行，或改用「手动输入 ID」。
                </p>
              ) : null}

              {!showManual ? (
                <div style={{ marginBottom: '0.85rem' }}>
                  <label style={fieldLabel} htmlFor="writing-scope-pick">
                    {pickerLabel}
                  </label>
                  <select
                    id="writing-scope-pick"
                    disabled={!canUseRowPicker || labelsLoading}
                    style={inputStyle}
                    value={pickedId}
                    onChange={(e) => setPickedId(e.target.value)}
                  >
                    <option value="">{labelsLoading ? '加载标签中…' : '— 请选择 —'}</option>
                    {selectedRowIds.map((id) => (
                      <option key={id} value={String(id)}>
                        #{id} · {labelsById[id] ?? '…'}
                      </option>
                    ))}
                  </select>
                  {!canUseRowPicker && listKind !== 'unknown' ? (
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', opacity: 0.75 }}>
                      请先在当前列表勾选至少一行。
                    </p>
                  ) : null}
                  {listKind === 'unknown' ? (
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', opacity: 0.75 }}>
                      未识别为内容大纲或文章列表，请展开「手动输入 ID」。
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div style={{ marginBottom: '0.85rem' }}>
                <button
                  type="button"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--theme-elevation-750)',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                  onClick={() => setShowManual((v) => !v)}
                >
                  {showManual ? '收起手动输入' : '手动输入 ID（高级）'}
                </button>
                {showManual ? (
                  <div style={{ marginTop: '0.65rem' }}>
                    <label style={fieldLabel}>文章 ID（可选）</label>
                    <input
                      aria-label="文章 ID"
                      inputMode="numeric"
                      placeholder="articles.id"
                      style={{ ...inputStyle, marginBottom: '0.65rem' }}
                      value={articleId}
                      onChange={(e) => setArticleId(e.target.value)}
                    />
                    <label style={fieldLabel}>内容大纲 ID（可选）</label>
                    <input
                      aria-label="内容大纲 ID"
                      inputMode="numeric"
                      placeholder="content-briefs.id"
                      style={inputStyle}
                      value={briefId}
                      onChange={(e) => setBriefId(e.target.value)}
                    />
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.72rem', opacity: 0.75 }}>
                      展开手动输入后，将仅使用上方两格（不再使用下拉选择）。
                    </p>
                  </div>
                ) : null}
              </div>

              <div style={{ marginBottom: '0.85rem' }}>
                <label style={fieldLabel}>本次最多执行几条（每轮）</label>
                <input
                  inputMode="numeric"
                  style={inputStyle}
                  value={maxRuns}
                  onChange={(e) => setMaxRuns(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: '0.85rem' }}>
                <label style={fieldLabel}>时间预算（秒，每轮）</label>
                <input
                  inputMode="decimal"
                  style={inputStyle}
                  value={budgetSeconds}
                  onChange={(e) => setBudgetSeconds(e.target.value)}
                />
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  marginBottom: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={stopOnFailure}
                  onChange={(e) => setStopOnFailure(e.target.checked)}
                />
                <span style={{ fontSize: '0.8125rem', lineHeight: 1.45 }}>遇失败即停止整次一键流程</span>
              </label>

              {error ? (
                <p style={{ marginBottom: '0.75rem', color: 'var(--theme-error-500)', fontSize: '0.8125rem' }}>
                  {error}
                </p>
              ) : null}

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Button onClick={submitExecute} type="button">
                  开始执行
                </Button>
                <Button buttonStyle="secondary" onClick={close} type="button">
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
