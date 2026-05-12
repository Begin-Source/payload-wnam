'use client'

import { Button, Gutter } from '@payloadcms/ui'
import Link from 'next/link'
import React, { useCallback, useEffect, useState } from 'react'

type SiteOption = {
  id: number
  name: string
  slug: string
  primaryDomain?: string | null
  mainProduct?: string | null
  siteLayout?: string | null
}

type PresetJson = {
  preset?: {
    id?: number | string
    name?: string
    slug?: string
    batchMode?: string
    defaultBatchLimit?: number | null
    maxPick?: number | null
  } | null
  error?: string
}

type SummaryJson = {
  ok?: boolean
  error?: string
  site?: {
    id: number
    name: string
    slug: string
    primaryDomain?: string | null
    mainProduct?: string | null
    siteLayout?: string | null
    pipelineProfile?: { id?: unknown; name?: unknown; slug?: unknown } | null
    keywordBatchPreset?: {
      id?: unknown
      name?: unknown
      slug?: unknown
      batchMode?: unknown
      defaultBatchLimit?: unknown
    } | null
  }
  counts?: {
    keywordsTotal: number
    keywordsEligible: number
    briefsTotal: number
    articlesDraft: number
    articlesPublished: number
    articlesQueued: number
    articlesBlocked: number
    jobsPending: number
    jobsRunning: number
    jobsFailed: number
    dailyPostCap: number
  }
  pendingJobIds?: number[]
}

type LaunchStepId = 'assets' | 'briefs' | 'workflow' | 'refresh'
type LaunchStepStatus = 'idle' | 'running' | 'done' | 'failed'

type LaunchStep = {
  id: LaunchStepId
  label: string
  description: string
  status: LaunchStepStatus
  detail?: string
}

const launchStepTemplates: Array<Omit<LaunchStep, 'status' | 'detail'>> = [
  {
    id: 'assets',
    label: '品牌素材',
    description: 'Logo / Hero 生成任务入队',
  },
  {
    id: 'briefs',
    label: 'Brief 排产',
    description: '按关键词策略创建 Brief 工作流',
  },
  {
    id: 'workflow',
    label: '执行工作流',
    description: '运行本站 pending 任务生成内容',
  },
  {
    id: 'refresh',
    label: '刷新状态',
    description: '重新读取站点内容与任务统计',
  },
]

function initialLaunchSteps(): LaunchStep[] {
  return launchStepTemplates.map((step) => ({ ...step, status: 'idle' }))
}

function launchStepStatusLabel(status: LaunchStepStatus): string {
  if (status === 'running') return '执行中'
  if (status === 'done') return '完成'
  if (status === 'failed') return '失败'
  return '等待'
}

function launchStepStatusColor(status: LaunchStepStatus): string {
  if (status === 'running') return '#d88b00'
  if (status === 'done') return '#2e7d32'
  if (status === 'failed') return '#c62828'
  return 'var(--theme-elevation-500)'
}

const cardStyle: React.CSSProperties = {
  padding: '1rem',
  borderRadius: 8,
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-50)',
  marginBottom: '1rem',
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
  background: 'var(--theme-elevation-0)',
  color: 'inherit',
  fontSize: '0.875rem',
}

const metricStyle: React.CSSProperties = {
  padding: '0.75rem',
  borderRadius: 8,
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-0)',
}

const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  flexWrap: 'wrap',
  alignItems: 'center',
}

function siteLabel(site: SiteOption): string {
  return `${site.name} (${site.slug})${site.primaryDomain ? ` · ${site.primaryDomain}` : ''}`
}

function numberOr(value: string, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
  return data
}

export function SiteLaunchPanelView(): React.ReactElement {
  const [sites, setSites] = useState<SiteOption[]>([])
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null)
  const [preset, setPreset] = useState<PresetJson['preset']>(null)
  const [summary, setSummary] = useState<SummaryJson | null>(null)
  const [batchMode, setBatchMode] = useState('quick_wins')
  const [briefLimit, setBriefLimit] = useState('10')
  const [publishLimit, setPublishLimit] = useState('30')
  const [minQualityScore, setMinQualityScore] = useState('80')
  const [runMaxRuns, setRunMaxRuns] = useState('12')
  const [runBudgetSeconds, setRunBudgetSeconds] = useState('180')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logLines, setLogLines] = useState<string[]>([])
  const [launchSteps, setLaunchSteps] = useState<LaunchStep[]>(initialLaunchSteps)

  const selectedSite = sites.find((site) => site.id === selectedSiteId) ?? null

  const addLog = useCallback((line: string): void => {
    setLogLines((prev) => [`${new Date().toLocaleTimeString()} · ${line}`, ...prev].slice(0, 16))
  }, [])

  const updateLaunchStep = useCallback((
    id: LaunchStepId,
    status: LaunchStepStatus,
    detail?: string,
  ): void => {
    setLaunchSteps((prev) =>
      prev.map((step) => (step.id === id ? { ...step, status, detail } : step)),
    )
  }, [])

  const loadSummaryValue = useCallback(async (): Promise<SummaryJson | null> => {
    if (selectedSiteId == null) {
      setSummary(null)
      return null
    }
    const res = await fetch(`/api/admin/site-launch/summary?siteId=${selectedSiteId}`, {
      credentials: 'include',
    })
    const data = (await res.json().catch(() => ({}))) as SummaryJson
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
    setSummary(data)
    return data
  }, [selectedSiteId])

  const loadSites = useCallback(async () => {
    const res = await fetch('/api/admin/article-quick-action/options', { credentials: 'include' })
    const data = (await res.json().catch(() => ({}))) as { sites?: SiteOption[]; error?: string }
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
    setSites(data.sites ?? [])
    if (selectedSiteId == null && data.sites?.[0]) setSelectedSiteId(data.sites[0].id)
  }, [selectedSiteId])

  const loadPreset = useCallback(async () => {
    if (selectedSiteId == null) {
      setPreset(null)
      return
    }
    const res = await fetch(`/api/admin/keyword-batch-presets/for-site?siteId=${selectedSiteId}`, {
      credentials: 'include',
    })
    const data = (await res.json().catch(() => ({}))) as PresetJson
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
    setPreset(data.preset ?? null)
    if (typeof data.preset?.batchMode === 'string' && data.preset.batchMode.trim()) {
      setBatchMode(data.preset.batchMode)
    }
    const suggestedLimit = data.preset?.defaultBatchLimit ?? data.preset?.maxPick
    if (typeof suggestedLimit === 'number' && Number.isFinite(suggestedLimit) && suggestedLimit > 0) {
      setBriefLimit(String(Math.floor(suggestedLimit)))
    }
  }, [selectedSiteId])

  useEffect(() => {
    void loadSites().catch((e) => setError(e instanceof Error ? e.message : '加载站点失败'))
  }, [loadSites])

  useEffect(() => {
    if (selectedSiteId == null) return
    setError(null)
    setLaunchSteps(initialLaunchSteps())
    void Promise.all([loadPreset(), loadSummaryValue()]).catch((e) => {
      setError(e instanceof Error ? e.message : '加载站点状态失败')
    })
  }, [selectedSiteId, loadPreset, loadSummaryValue])

  const runAction = async (key: string, fn: () => Promise<void>): Promise<void> => {
    setBusy(key)
    setError(null)
    try {
      await fn()
      await loadSummaryValue().catch((): null => null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败')
    } finally {
      setBusy(null)
    }
  }

  const requireSiteId = (): number => {
    if (selectedSiteId == null) throw new Error('请先选择站点')
    return selectedSiteId
  }

  const generateDomain = async (): Promise<void> => {
    const siteId = requireSiteId()
    await postJson('/api/admin/sites/generate-domain', { siteId, prepare: true })
    addLog('域名流程已标记运行中')
    void postJson('/api/admin/sites/generate-domain', {
      siteId,
      force: false,
      ...(selectedSite?.mainProduct ? { mainProduct: selectedSite.mainProduct } : {}),
    })
      .then(() => {
        addLog('域名生成完成')
        void loadSummaryValue().catch((): null => null)
      })
      .catch((e) => addLog(`域名生成失败：${e instanceof Error ? e.message : String(e)}`))
  }

  const queueBrandAssets = async (): Promise<void> => {
    const siteId = requireSiteId()
    const [logo, hero] = await Promise.all([
      postJson<{ queuedCount?: number; skipped?: unknown[] }>('/api/admin/sites/queue-site-logo', {
        siteIds: [siteId],
      }),
      postJson<{ queuedCount?: number; skipped?: unknown[] }>('/api/admin/sites/queue-hero-banner', {
        siteIds: [siteId],
      }),
    ])
    addLog(`品牌素材已入队：Logo ${logo.queuedCount ?? 0}，Hero ${hero.queuedCount ?? 0}`)
  }

  const enqueueBriefs = async (): Promise<void> => {
    const siteId = requireSiteId()
    const data = await postJson<{
      enqueued?: number
      skipped?: number
      pickedTerms?: string[]
      errorsSample?: string[]
    }>('/api/admin/articles/batch-enqueue', {
      siteId,
      mode: batchMode,
      limit: numberOr(briefLimit, 10),
    })
    const terms = Array.isArray(data.pickedTerms) && data.pickedTerms.length > 0
      ? ` · ${data.pickedTerms.slice(0, 3).join(', ')}`
      : ''
    const errors = Array.isArray(data.errorsSample) && data.errorsSample.length > 0
      ? ` · 提示：${data.errorsSample[0]}`
      : ''
    addLog(`Brief 排产完成：入队 ${data.enqueued ?? 0}，跳过 ${data.skipped ?? 0}${terms}${errors}`)
  }

  const runSiteJobs = async (freshSummary?: SummaryJson | null): Promise<void> => {
    const state = freshSummary ?? summary
    const ids = state?.pendingJobIds ?? []
    if (ids.length === 0) throw new Error('当前站点没有 pending 工作流任务')
    const data = await postJson<{ totalRuns?: number; stoppedReason?: string; ok?: boolean }>(
      '/api/admin/pipeline/run-next',
      {
        jobIds: ids,
        maxRuns: numberOr(runMaxRuns, 12),
        budgetSeconds: numberOr(runBudgetSeconds, 180),
        stopOnFailure: true,
      },
    )
    addLog(`本站工作流执行完成：运行 ${data.totalRuns ?? 0} 次，停止原因 ${data.stoppedReason ?? 'unknown'}`)
  }

  const schedulePublish = async (): Promise<void> => {
    const siteId = requireSiteId()
    const data = await postJson<{
      scanned?: number
      queued?: number
      blocked?: number
      dailyPostCap?: number
    }>('/api/admin/site-launch/schedule-publish', {
      siteId,
      limit: numberOr(publishLimit, 30),
      minQualityScore: numberOr(minQualityScore, 80),
    })
    addLog(`发布队列检查：扫描 ${data.scanned ?? 0}，排期 ${data.queued ?? 0}，阻塞 ${data.blocked ?? 0}，每日上限 ${data.dailyPostCap ?? '—'}`)
  }

  const publishOnce = async (): Promise<void> => {
    const siteId = requireSiteId()
    const data = await postJson<{
      scanned?: number
      published?: number
      blocked?: number
      skipped?: number
    }>('/api/admin/site-launch/run-scheduled-publish', {
      siteId,
      limit: 20,
      minQualityScore: numberOr(minQualityScore, 80),
    })
    addLog(`定时发布执行：扫描 ${data.scanned ?? 0}，发布 ${data.published ?? 0}，阻塞 ${data.blocked ?? 0}，跳过 ${data.skipped ?? 0}`)
  }

  const oneClickLaunch = async (): Promise<void> => {
    setLaunchSteps(initialLaunchSteps())

    try {
      updateLaunchStep('assets', 'running', '正在创建 Logo / Hero 工作流任务')
      await queueBrandAssets()
      updateLaunchStep('assets', 'done', 'Logo / Hero 已入队')
    } catch (e) {
      updateLaunchStep('assets', 'failed', e instanceof Error ? e.message : '品牌素材入队失败')
      throw e
    }

    try {
      updateLaunchStep('briefs', 'running', `正在按 ${batchMode} 排产 ${numberOr(briefLimit, 10)} 条 Brief`)
      await enqueueBriefs()
      updateLaunchStep('briefs', 'done', 'Brief 工作流已入队')
    } catch (e) {
      updateLaunchStep('briefs', 'failed', e instanceof Error ? e.message : 'Brief 排产失败')
      throw e
    }

    let nextSummary: SummaryJson | null = null
    try {
      updateLaunchStep('workflow', 'running', '正在读取待执行工作流任务')
      nextSummary = await loadSummaryValue()
      const pendingCount = nextSummary?.pendingJobIds?.length ?? 0
      if (pendingCount === 0) {
        updateLaunchStep('workflow', 'done', '没有 pending 工作流任务需要执行')
      } else {
        updateLaunchStep('workflow', 'running', `发现 ${pendingCount} 个 pending 任务，开始执行`)
        await runSiteJobs(nextSummary)
        updateLaunchStep('workflow', 'done', '本站 pending 工作流已执行一轮')
      }
    } catch (e) {
      updateLaunchStep('workflow', 'failed', e instanceof Error ? e.message : '工作流执行失败')
      throw e
    }

    try {
      updateLaunchStep('refresh', 'running', '正在刷新站点统计')
      await loadSummaryValue()
      updateLaunchStep('refresh', 'done', '站点统计已刷新')
    } catch (e) {
      updateLaunchStep('refresh', 'failed', e instanceof Error ? e.message : '状态刷新失败')
      throw e
    }
  }

  const counts = summary?.counts

  return (
    <Gutter>
      <div style={{ padding: '2rem 0 3rem' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <h1 style={{ margin: '0 0 0.4rem', fontSize: '2rem' }}>站点启动操作面板</h1>
          <p style={{ margin: 0, maxWidth: 880, opacity: 0.82, lineHeight: 1.55 }}>
            员工在这里选择一个站点，然后按顺序完成前期建站内容流程。右侧快捷抽屉保留为单项补救工具；日常规模化操作以本面板为准。
          </p>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 2fr) 1fr 1fr', gap: '0.75rem' }}>
            <label>
              <span style={fieldLabel}>站点</span>
              <select
                style={inputStyle}
                value={selectedSiteId ?? ''}
                onChange={(e) => setSelectedSiteId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">请选择站点</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {siteLabel(site)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span style={fieldLabel}>推荐关键词策略</span>
              <select style={inputStyle} value={batchMode} onChange={(e) => setBatchMode(e.target.value)}>
                <option value="quick_wins">Quick-win</option>
                <option value="high_commission_affiliate">高价值类目</option>
                <option value="comparison_decision">对比决策</option>
                <option value="geo_friendly">GEO / AI 引用</option>
                <option value="default">默认机会分</option>
                <option value="seasonal">季节趋势</option>
                <option value="refresh_decay">衰减刷新</option>
              </select>
            </label>
            <label>
              <span style={fieldLabel}>Brief 入队数量</span>
              <input style={inputStyle} value={briefLimit} onChange={(e) => setBriefLimit(e.target.value)} />
            </label>
          </div>

          <div style={{ marginTop: '0.75rem', fontSize: '0.8125rem', opacity: 0.86 }}>
            当前站点预设：
            {' '}
            {preset ? (
              <>
                {preset.name ?? preset.slug ?? '未命名预设'}
                {preset.batchMode ? ` · ${preset.batchMode}` : ''}
              </>
            ) : (
              '未设置，面板会使用你上面选择的策略'
            )}
          </div>
        </div>

        {error ? (
          <div style={{ ...cardStyle, color: 'var(--theme-error-500)' }}>{error}</div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          {[
            ['关键词 / eligible', `${counts?.keywordsTotal ?? '—'} / ${counts?.keywordsEligible ?? '—'}`],
            ['内容大纲', counts?.briefsTotal ?? '—'],
            ['草稿 / 已发布', `${counts?.articlesDraft ?? '—'} / ${counts?.articlesPublished ?? '—'}`],
            ['待运行 / 运行中', `${counts?.jobsPending ?? '—'} / ${counts?.jobsRunning ?? '—'}`],
            ['发布队列 / 阻塞', `${counts?.articlesQueued ?? '—'} / ${counts?.articlesBlocked ?? '—'}`],
            ['每日发布上限', counts?.dailyPostCap ?? '—'],
            ['流水线', String(summary?.site?.pipelineProfile?.name ?? '未设置')],
            ['站点布局', summary?.site?.siteLayout ?? '—'],
          ].map(([label, value]) => (
            <div key={String(label)} style={metricStyle}>
              <div style={{ fontSize: '0.75rem', opacity: 0.72, marginBottom: '0.35rem' }}>{label}</div>
              <div style={{ fontSize: '1rem', fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.05rem', marginTop: 0 }}>一键启动</h2>
          <p style={{ fontSize: '0.8125rem', opacity: 0.82, lineHeight: 1.55 }}>
            执行品牌素材入队、按推荐策略排产 Brief，并运行本站 pending 工作流一段时间。发布仍单独执行，避免低质量草稿自动上线。
          </p>
          <div style={actionRowStyle}>
            <Button disabled={busy != null || selectedSiteId == null} onClick={() => void runAction('one-click', oneClickLaunch)}>
              {busy === 'one-click'
                ? `执行中：${launchSteps.find((step) => step.status === 'running')?.label ?? '准备中'}`
                : '一键启动前期内容'}
            </Button>
            <Button buttonStyle="secondary" disabled={busy != null} onClick={() => void runAction('refresh', async () => { await loadSummaryValue(); addLog('状态已刷新') })}>
              刷新状态
            </Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.6rem', marginTop: '1rem' }}>
            {launchSteps.map((step, index) => (
              <div
                key={step.id}
                style={{
                  padding: '0.75rem',
                  borderRadius: 8,
                  border: `1px solid ${step.status === 'running' ? '#d88b00' : 'var(--theme-elevation-150)'}`,
                  background: step.status === 'running' ? 'rgba(216, 139, 0, 0.12)' : 'var(--theme-elevation-0)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  <strong style={{ fontSize: '0.85rem' }}>{index + 1}. {step.label}</strong>
                  <span style={{ color: launchStepStatusColor(step.status), fontSize: '0.75rem', fontWeight: 600 }}>
                    {launchStepStatusLabel(step.status)}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', opacity: 0.78, lineHeight: 1.45 }}>
                  {step.detail ?? step.description}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.05rem', marginTop: 0 }}>单步操作</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>
            <div style={metricStyle}>
              <h3 style={{ fontSize: '0.95rem', marginTop: 0 }}>1. 域名与品牌</h3>
              <div style={actionRowStyle}>
                <Button buttonStyle="secondary" disabled={busy != null || selectedSiteId == null} onClick={() => void runAction('domain', generateDomain)}>
                  生成域名
                </Button>
                <Button buttonStyle="secondary" disabled={busy != null || selectedSiteId == null} onClick={() => void runAction('assets', queueBrandAssets)}>
                  Logo + Hero 入队
                </Button>
              </div>
            </div>

            <div style={metricStyle}>
              <h3 style={{ fontSize: '0.95rem', marginTop: 0 }}>2. 关键词到 Brief</h3>
              <div style={actionRowStyle}>
                <Button buttonStyle="secondary" disabled={busy != null || selectedSiteId == null} onClick={() => void runAction('briefs', enqueueBriefs)}>
                  按策略排产 Brief
                </Button>
                <Link href="/admin/collections/keywords" prefetch={false} style={{ fontSize: '0.8125rem' }}>
                  查看关键词
                </Link>
              </div>
            </div>

            <div style={metricStyle}>
              <h3 style={{ fontSize: '0.95rem', marginTop: 0 }}>3. 运行工作流</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <label>
                  <span style={fieldLabel}>最多运行次数</span>
                  <input style={inputStyle} value={runMaxRuns} onChange={(e) => setRunMaxRuns(e.target.value)} />
                </label>
                <label>
                  <span style={fieldLabel}>预算秒数</span>
                  <input style={inputStyle} value={runBudgetSeconds} onChange={(e) => setRunBudgetSeconds(e.target.value)} />
                </label>
              </div>
              <Button buttonStyle="secondary" disabled={busy != null || selectedSiteId == null || (summary?.pendingJobIds?.length ?? 0) === 0} onClick={() => void runAction('run-jobs', async () => runSiteJobs())}>
                运行本站待处理任务
              </Button>
            </div>

            <div style={metricStyle}>
              <h3 style={{ fontSize: '0.95rem', marginTop: 0 }}>4. 质量门槛与发布</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <label>
                  <span style={fieldLabel}>发布排队数量</span>
                  <input style={inputStyle} value={publishLimit} onChange={(e) => setPublishLimit(e.target.value)} />
                </label>
                <label>
                  <span style={fieldLabel}>最低质量分</span>
                  <input style={inputStyle} value={minQualityScore} onChange={(e) => setMinQualityScore(e.target.value)} />
                </label>
              </div>
              <div style={actionRowStyle}>
                <Button buttonStyle="secondary" disabled={busy != null || selectedSiteId == null} onClick={() => void runAction('schedule-publish', schedulePublish)}>
                  加入发布队列
                </Button>
                <Button buttonStyle="secondary" disabled={busy != null || selectedSiteId == null} onClick={() => void runAction('publish-once', publishOnce)}>
                  执行一次发布
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.05rem', marginTop: 0 }}>操作日志</h2>
          {logLines.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.8125rem', opacity: 0.75 }}>暂无操作。</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1rem', fontSize: '0.8125rem', lineHeight: 1.7 }}>
              {logLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Gutter>
  )
}
