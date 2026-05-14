'use client'

import { Button, Gutter } from '@payloadcms/ui'
import Link from 'next/link'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import type { BackgroundActivityJob } from '@/components/adminBackgroundActivity/AdminBackgroundActivityContext'
import { useAdminBackgroundActivity } from '@/components/adminBackgroundActivity/AdminBackgroundActivityProvider'

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
    status?: string | null
    defaultAmazonTrackingId?: string | null
    notes?: string | null
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

type SiteSummary = NonNullable<SummaryJson['site']>

type SiteRecordForm = {
  name: string
  slug: string
  primaryDomain: string
  mainProduct: string
  siteLayout: string
  status: string
  defaultAmazonTrackingId: string
  notes: string
}

type SiteOption = {
  id: number
  name: string
  slug: string
  primaryDomain?: string | null
  mainProduct?: string | null
  siteLayout?: string | null
}

type CategoryOption = {
  id: number
  name: string
  slug: string
  slotIndex?: number | null
  kind?: 'article' | 'guide' | 'review' | null
}

type OfferReviewOption = {
  id: number
  title: string
  asin?: string | null
  hasReviewArticle?: boolean
  reviewStatus?: string | null
}

type ContentActionTarget = NonNullable<
  NonNullable<BackgroundActivityJob['contentManagementActionSummary']>['targetCollection']
>

type ContentActionProgress = (detail: string) => void

type LaunchStepId = 'domain' | 'design' | 'trust'
type LaunchStepStatus = 'idle' | 'running' | 'done' | 'failed'

type LaunchStep = {
  id: LaunchStepId
  label: string
  description: string
  status: LaunchStepStatus
  detail?: string
}

function describePipelineStoppedReason(reason: string | null | undefined): string {
  switch (reason) {
    case 'budget':
      return '本轮时间到，可继续运行'
    case 'max_runs':
      return '达到本轮次数上限，可继续运行'
    case 'no_pending':
      return '没有待处理任务'
    case 'failure':
      return '任务执行失败'
    case 'aborted':
      return '已取消'
    case undefined:
    case null:
    case '':
      return '未知'
    default:
      return reason
  }
}

const launchStepTemplates: Array<Omit<LaunchStep, 'status' | 'detail'>> = [
  {
    id: 'domain',
    label: '域名建议',
    description: '生成可用域名建议并写回站点',
  },
  {
    id: 'design',
    label: '设计',
    description: '生成 AMZ 站点设计配置',
  },
  {
    id: 'trust',
    label: '信任页面',
    description: '生成 About / Contact / Privacy 等信任页',
  },
]

const emptySiteRecordForm: SiteRecordForm = {
  name: '',
  slug: '',
  primaryDomain: '',
  mainProduct: '',
  siteLayout: 'amz-template-1',
  status: 'draft',
  defaultAmazonTrackingId: '',
  notes: '',
}

const siteLayoutOptions = [
  { label: 'AMZ Template 1', value: 'amz-template-1' },
  { label: 'AMZ Template 2', value: 'amz-template-2' },
  { label: 'Template 1', value: 'template1' },
  { label: 'Template 2', value: 'template2' },
]

const siteStatusOptions = [
  { label: 'Draft', value: 'draft' },
  { label: 'Active', value: 'active' },
  { label: 'Archived', value: 'archived' },
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

const contentLinkStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  textDecoration: 'underline',
  textUnderlineOffset: 3,
}

function numberOr(value: string, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

function siteRecordFormFromSite(site: Partial<SiteSummary> | null | undefined): SiteRecordForm {
  return {
    name: String(site?.name ?? ''),
    slug: String(site?.slug ?? ''),
    primaryDomain: String(site?.primaryDomain ?? ''),
    mainProduct: String(site?.mainProduct ?? ''),
    siteLayout: String(site?.siteLayout ?? 'amz-template-1'),
    status: String(site?.status ?? 'draft'),
    defaultAmazonTrackingId: String(site?.defaultAmazonTrackingId ?? ''),
    notes: String(site?.notes ?? ''),
  }
}

function siteOptionLabel(site: SiteOption): string {
  const domain = site.primaryDomain?.trim()
  const mainProduct = site.mainProduct?.trim()
  return [
    `${site.name} (${site.slug})`,
    domain ? domain : null,
    mainProduct ? `主产品：${mainProduct}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function siteOptionFromSummary(site: SiteSummary): SiteOption {
  return {
    id: site.id,
    name: site.name,
    slug: site.slug,
    primaryDomain: site.primaryDomain,
    mainProduct: site.mainProduct,
    siteLayout: site.siteLayout,
  }
}

function siteProductPrompt(site: Pick<SiteSummary, 'mainProduct' | 'name' | 'slug'>): string {
  return (
    (typeof site.mainProduct === 'string' ? site.mainProduct.trim() : '') ||
    site.name.trim() ||
    site.slug.trim()
  )
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function adminCollectionHref(collection: ContentActionTarget, siteId?: number | null): string {
  const base = `/admin/collections/${collection}`
  if (typeof siteId !== 'number' || !Number.isFinite(siteId)) return base
  const encodedSiteId = encodeURIComponent(String(siteId))
  if (collection === 'offers') return `${base}?where[sites][contains]=${encodedSiteId}`
  return `${base}?where[site][equals]=${encodedSiteId}`
}

function parseSiteIdParam(value: string | null | undefined): number | null {
  if (!value) return null
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

function readInitialSelectedSiteId(): number | null {
  if (typeof window === 'undefined') return null
  return parseSiteIdParam(new URLSearchParams(window.location.search).get('siteId'))
}

export function SiteLaunchPanelView(): React.ReactElement {
  const {
    startSiteRecordSaveJob,
    completeSiteRecordSaveJob,
    failSiteRecordSaveJob,
    startTrustPagesBundleJob,
    completeTrustPagesBundleJob,
    failTrustPagesBundleJob,
    startContentManagementActionJob,
    updateContentManagementActionJobProgress,
    completeContentManagementActionJob,
    failContentManagementActionJob,
  } = useAdminBackgroundActivity()
  const [sites, setSites] = useState<SiteOption[]>([])
  const [sitesLoading, setSitesLoading] = useState(false)
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null)
  const [preset, setPreset] = useState<PresetJson['preset']>(null)
  const [summary, setSummary] = useState<SummaryJson | null>(null)
  const [batchMode, setBatchMode] = useState('quick_wins')
  const [siteRecord, setSiteRecord] = useState<SiteRecordForm>(emptySiteRecordForm)
  const [briefLimit, setBriefLimit] = useState('10')
  const [reviewConcurrency, setReviewConcurrency] = useState('5')
  const [publishLimit, setPublishLimit] = useState('30')
  const [minQualityScore, setMinQualityScore] = useState('80')
  const [runMaxRuns, setRunMaxRuns] = useState('12')
  const [runBudgetSeconds, setRunBudgetSeconds] = useState('180')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logLines, setLogLines] = useState<string[]>([])
  const [launchSteps, setLaunchSteps] = useState<LaunchStep[]>(initialLaunchSteps)
  const currentSiteIdRef = useRef<number | null>(null)
  const initialSiteIdAppliedRef = useRef(false)

  const addLog = useCallback((line: string): void => {
    setLogLines((prev) => [`${new Date().toLocaleTimeString()} · ${line}`, ...prev].slice(0, 16))
  }, [])

  const updateLaunchStep = useCallback(
    (id: LaunchStepId, status: LaunchStepStatus, detail?: string): void => {
      setLaunchSteps((prev) =>
        prev.map((step) => (step.id === id ? { ...step, status, detail } : step)),
      )
    },
    [],
  )

  const loadSites = useCallback(async (): Promise<void> => {
    setSitesLoading(true)
    try {
      const res = await fetch('/api/admin/article-quick-action/options', { credentials: 'include' })
      const data = (await res.json().catch(() => ({}))) as {
        sites?: SiteOption[]
        error?: string
      }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setSites(data.sites ?? [])
    } finally {
      setSitesLoading(false)
    }
  }, [])

  const loadSummaryValue = useCallback(
    async (siteIdOverride?: number): Promise<SummaryJson | null> => {
      const siteId = siteIdOverride ?? selectedSiteId
      if (siteId == null) {
        setSummary(null)
        return null
      }
      const res = await fetch(`/api/admin/site-launch/summary?siteId=${siteId}`, {
        credentials: 'include',
      })
      const data = (await res.json().catch(() => ({}))) as SummaryJson
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setSummary(data)
      return data
    },
    [selectedSiteId],
  )

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
    if (
      typeof suggestedLimit === 'number' &&
      Number.isFinite(suggestedLimit) &&
      suggestedLimit > 0
    ) {
      setBriefLimit(String(Math.floor(suggestedLimit)))
    }
  }, [selectedSiteId])

  useEffect(() => {
    void loadSites().catch((e) => {
      setError(e instanceof Error ? e.message : '加载站点列表失败')
    })
  }, [loadSites])

  useEffect(() => {
    if (initialSiteIdAppliedRef.current) return
    const initialSiteId = readInitialSelectedSiteId()
    if (initialSiteId == null) return
    initialSiteIdAppliedRef.current = true
    currentSiteIdRef.current = initialSiteId
    setSelectedSiteId(initialSiteId)
  }, [])

  useEffect(() => {
    if (selectedSiteId == null) return
    currentSiteIdRef.current = selectedSiteId
    setError(null)
    setLaunchSteps(initialLaunchSteps())
    void Promise.all([loadPreset(), loadSummaryValue()]).catch((e) => {
      setError(e instanceof Error ? e.message : '加载站点状态失败')
    })
  }, [selectedSiteId, loadPreset, loadSummaryValue])

  useEffect(() => {
    if (!summary?.site || summary.site.id !== selectedSiteId) return
    setSiteRecord(siteRecordFormFromSite(summary.site))
  }, [selectedSiteId, summary?.site])

  const runAction = async (key: string, fn: () => Promise<void>): Promise<void> => {
    setBusy(key)
    setError(null)
    try {
      await fn()
      await loadSummaryValue(currentSiteIdRef.current ?? undefined).catch((): null => null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败')
    } finally {
      setBusy(null)
    }
  }

  const updateSiteRecordField = (field: keyof SiteRecordForm, value: string): void => {
    setSiteRecord((prev) => ({ ...prev, [field]: value }))
  }

  const resolveOperationSite = async (): Promise<SiteSummary> => {
    if (selectedSiteId == null) return saveSiteRecord()
    if (summary?.site?.id === selectedSiteId) return summary.site
    const data = await loadSummaryValue(selectedSiteId)
    if (!data?.site) throw new Error('站点状态加载失败')
    return data.site
  }

  const runContentActionWithBanner = async (
    label: string,
    targetCollection: ContentActionTarget,
    fn: (site: SiteSummary, progress: ContentActionProgress) => Promise<string | void>,
  ): Promise<void> => {
    const site = await resolveOperationSite()
    const jobId = startContentManagementActionJob({
      label,
      siteId: site.id,
      siteLabel: site.name || site.slug,
      targetCollection,
    })
    const progress: ContentActionProgress = (detail) => {
      updateContentManagementActionJobProgress({ jobId, detail })
    }
    try {
      progress('已接收操作，准备执行')
      const detail = await fn(site, progress)
      const detailText = typeof detail === 'string' ? detail.trim() : ''
      completeContentManagementActionJob({
        jobId,
        ...(detailText ? { detail: detailText } : {}),
        targetCollection,
      })
    } catch (e) {
      failContentManagementActionJob({
        jobId,
        message: e instanceof Error ? e.message : '操作失败',
      })
      throw e
    }
  }

  const saveSiteRecord = async (): Promise<SiteSummary> => {
    const mainProduct = siteRecord.mainProduct.trim()
    const name = siteRecord.name.trim() || mainProduct
    if (!name) throw new Error('请填写标识名称或主产品')
    const creating = selectedSiteId == null
    const saveJobId = startSiteRecordSaveJob({
      action: creating ? 'create' : 'update',
      siteLabel: name,
    })

    try {
      const data = await postJson<{ site?: SiteSummary }>('/api/admin/site-launch/site-record', {
        ...(selectedSiteId != null ? { siteId: selectedSiteId } : {}),
        fields: {
          name,
          slug: siteRecord.slug.trim(),
          primaryDomain: siteRecord.primaryDomain.trim(),
          mainProduct,
          siteLayout: siteRecord.siteLayout,
          status: siteRecord.status,
          defaultAmazonTrackingId: siteRecord.defaultAmazonTrackingId.trim(),
          notes: siteRecord.notes.trim(),
        },
      })
      if (!data.site) throw new Error('站点保存失败')
      const saved = data.site
      currentSiteIdRef.current = saved.id
      setSites((prev) => {
        const next = siteOptionFromSummary(saved)
        const withoutCurrent = prev.filter((site) => site.id !== saved.id)
        return [next, ...withoutCurrent]
      })
      setSelectedSiteId(saved.id)
      setSiteRecord(siteRecordFormFromSite(saved))
      setSummary((prev) =>
        prev?.site && prev.site.id === saved.id
          ? { ...prev, site: { ...prev.site, ...saved } }
          : prev,
      )
      addLog(creating ? '站点记录已创建' : '站点记录已保存')
      completeSiteRecordSaveJob({
        jobId: saveJobId,
        summary: {
          action: creating ? 'create' : 'update',
          siteId: saved.id,
          name: saved.name,
          slug: saved.slug,
          mainProduct: saved.mainProduct,
        },
      })
      void loadSummaryValue(saved.id).catch((): null => null)
      return saved
    } catch (e) {
      failSiteRecordSaveJob({
        jobId: saveJobId,
        message: e instanceof Error ? e.message : '请求失败',
      })
      throw e
    }
  }

  const generateDomain = async (siteOverride?: SiteSummary): Promise<void> => {
    const savedSite = siteOverride ?? (await resolveOperationSite())
    const siteId = savedSite.id
    const mainProduct = siteProductPrompt(savedSite)
    await postJson('/api/admin/sites/generate-domain', { siteId, prepare: true })
    addLog('域名流程已标记运行中')
    await postJson('/api/admin/sites/generate-domain', {
      siteId,
      force: false,
      ...(mainProduct ? { mainProduct } : {}),
    })
    addLog('域名建议生成完成')
    await loadSummaryValue(siteId).catch((): null => null)
  }

  const generateDesign = async (siteOverride?: SiteSummary): Promise<void> => {
    const savedSite = siteOverride ?? (await resolveOperationSite())
    const siteId = savedSite.id
    const mainProduct = siteProductPrompt(savedSite) || siteRecord.mainProduct.trim()
    await postJson('/api/admin/site-blueprints/generate-amz-template-design', {
      siteId,
      mainProduct,
      prepare: true,
    })
    const data = await postJson<{ blueprintId?: number }>(
      '/api/admin/site-blueprints/generate-amz-template-design',
      {
        siteId,
        mainProduct,
        afterPrepare: true,
      },
    )
    addLog(`设计生成完成${data.blueprintId != null ? `：#${data.blueprintId}` : ''}`)
  }

  const generateTrustPages = async (siteOverride?: SiteSummary): Promise<void> => {
    const savedSite = siteOverride ?? (await resolveOperationSite())
    const siteId = savedSite.id
    const jobId = startTrustPagesBundleJob({ siteLabel: savedSite.name || savedSite.slug })
    try {
      await postJson('/api/admin/pages/generate-trust-content', { siteId, prepare: true })
      const data = await postJson<{ slugs?: unknown; locale?: unknown }>(
        '/api/admin/pages/generate-trust-content',
        {
          siteId,
          afterPrepare: true,
        },
      )
      const slugs = Array.isArray(data.slugs)
        ? data.slugs
            .map((x) => (typeof x === 'string' ? x.trim() : String(x ?? '').trim()))
            .filter(Boolean)
        : undefined
      const locale =
        typeof data.locale === 'string' && data.locale.trim() ? data.locale.trim() : undefined
      completeTrustPagesBundleJob({ jobId, slugs, locale })
      addLog('信任页面生成完成')
    } catch (e) {
      failTrustPagesBundleJob({
        jobId,
        message: e instanceof Error ? e.message : '信任页面生成失败',
      })
      throw e
    }
  }

  const syncKeywords = async (siteOverride?: SiteSummary): Promise<string> => {
    const savedSite = siteOverride ?? (await resolveOperationSite())
    const categories = await loadCategoriesForSite(savedSite.id)
    const categorySeeds = categories
      .map((cat) => cat.name.trim())
      .filter(Boolean)
      .slice(0, 5)
    const fallbackSeed = (savedSite.mainProduct || savedSite.name || savedSite.slug).trim()
    const seeds = categorySeeds.length > 0 ? categorySeeds : fallbackSeed ? [fallbackSeed] : []
    if (seeds.length === 0) throw new Error('请先生成分类或填写主产品，拉取关键词需要种子词')
    const data = await postJson<{
      total?: number
      persistable?: number
      filteredOutByPersistCriteria?: number
      persisted?: number
      skipped?: number
      eligibleCount?: number
      dataForSeoUsdCharged?: number
    }>('/api/admin/keywords/dfs-fetch', {
      siteId: savedSite.id,
      seeds,
      intentWhitelist: ['informational', 'navigational', 'commercial', 'transactional'],
      maxKd: 30,
      minVolume: 30,
      persistFilter: {
        maxKdLessThan: 30,
        minVolumeGreaterThan: 30,
      },
    })
    const seedNote =
      categorySeeds.length > 0 ? `分类种子 ${categorySeeds.length} 个` : '主产品种子 1 个'
    const detail = `${seedNote}；候选 ${data.total ?? 0}，符合 KD<30 且 volume>30 ${data.persistable ?? 0}，过滤 ${data.filteredOutByPersistCriteria ?? 0}，写入 ${data.persisted ?? 0}，跳过 ${data.skipped ?? 0}，eligible ${data.eligibleCount ?? 0}${typeof data.dataForSeoUsdCharged === 'number' ? `，成本 $${data.dataForSeoUsdCharged.toFixed(4)}` : ''}`
    addLog(`关键词拉取完成：${detail}`)
    return detail
  }

  const generateOutlines = async (
    siteOverride?: SiteSummary,
    progress?: ContentActionProgress,
  ): Promise<string> => {
    const savedSite = siteOverride ?? (await resolveOperationSite())
    const siteId = savedSite.id
    progress?.('按站点表格里的关键词预设和流水线排产大纲任务')
    const data = await postJson<{
      jobType?: string
      enqueued?: number
      skipped?: number
      pickedTerms?: string[]
      jobIds?: Array<string | number>
      errorsSample?: string[]
    }>('/api/admin/articles/batch-enqueue', {
      siteId,
      useSitePreset: true,
      mode: batchMode,
      limit: numberOr(briefLimit, 10),
      chainAfterBrief: false,
    })
    if (data.jobType && data.jobType !== 'brief_generate') {
      throw new Error('当前关键词预设不是大纲生成模式，请在站点表格选择 Brief / 文章类关键词预设')
    }
    const jobIds = Array.isArray(data.jobIds) ? data.jobIds : []
    let runDetail = ''
    if (jobIds.length > 0) {
      progress?.(`大纲任务入队 ${jobIds.length} 个，开始生成 Brief`)
      const run = await postJson<{
        ok?: boolean
        totalRuns?: number
        stoppedReason?: string
        failureSummary?: string
      }>('/api/admin/pipeline/run-next', {
        jobIds,
        maxRuns: Math.min(20, Math.max(1, jobIds.length)),
        budgetMs: 55000,
        stopOnFailure: true,
      })
      const stopped = describePipelineStoppedReason(run.stoppedReason)
      if (run.ok === false && run.stoppedReason === 'failure') {
        throw new Error(run.failureSummary || '大纲生成失败')
      }
      runDetail = `，本轮执行 ${run.totalRuns ?? 0}，状态 ${stopped}`
    } else {
      progress?.('没有新的大纲任务需要执行')
    }
    const terms =
      Array.isArray(data.pickedTerms) && data.pickedTerms.length > 0
        ? ` · ${data.pickedTerms.slice(0, 3).join(', ')}`
        : ''
    const errors =
      Array.isArray(data.errorsSample) && data.errorsSample.length > 0
        ? ` · 提示：${data.errorsSample[0]}`
        : ''
    const detail = `大纲任务入队 ${data.enqueued ?? 0}，跳过 ${data.skipped ?? 0}${runDetail}${terms}${errors}`
    addLog(`内容大纲生成：${detail}`)
    await loadSummaryValue(savedSite.id).catch((): null => null)
    return detail
  }

  const generateArticleDrafts = async (
    siteOverride?: SiteSummary,
    progress?: ContentActionProgress,
  ): Promise<string> => {
    const savedSite = siteOverride ?? (await resolveOperationSite())
    progress?.('从已有大纲排产文章草稿任务')
    const draft = await postJson<{
      queriedCount?: number
      results?: Array<{ created?: boolean; jobId?: number | string; reason?: string }>
    }>('/api/admin/content-briefs/enqueue-draft-skeleton', {
      siteId: savedSite.id,
      limit: numberOr(briefLimit, 10),
    })
    const results = Array.isArray(draft.results) ? draft.results : []
    const created = results.filter((r) => r.created).length
    const skipped = results.length - created
    const firstReason = results.find((r) => !r.created && r.reason)?.reason
    progress?.(`文章草稿任务入队 ${created}，跳过 ${skipped}，交给后台 Runner 继续生成正文`)
    const data = await postJson<{
      enqueue?: {
        skippedEnqueue?: boolean
        enqueued?: number
        skipped?: number
        pickedTerms?: string[]
        errorsSample?: string[]
      }
      runnerJobId?: string | number
      runnerReused?: boolean
      runnerRestarted?: boolean
      revivedRunningJobs?: number
      scheduled?: boolean
      message?: string
    }>('/api/admin/site-launch/content-runner/start', {
      siteId: savedSite.id,
      enqueueBriefs: false,
      forceRunnerRestart: true,
      reviveStaleRunningJobs: true,
      batchMaxRuns: 20,
      batchBudgetMs: 55000,
      maxBatches: 80,
      stopOnFailure: true,
    })
    const reason = firstReason ? ` · 提示：${firstReason}` : ''
    const detail = `文章草稿任务入队 ${created}，跳过 ${skipped}，查询大纲 ${
      draft.queriedCount ?? results.length
    }${reason}；后台 Runner #${String(
      data.runnerJobId ?? '—',
    )}${data.runnerRestarted ? '（重新接管）' : data.runnerReused ? '（复用运行中）' : ''}${
      typeof data.revivedRunningJobs === 'number' && data.revivedRunningJobs > 0
        ? ` · 已恢复 ${data.revivedRunningJobs} 个长时间运行中的任务`
        : ''
    }${
      data.message ? ` · ${data.message}` : ''
    }`
    addLog(`文章草稿生成：${detail}`)
    await loadSummaryValue(savedSite.id).catch((): null => null)
    return detail
  }

  const runSiteJobs = async (
    freshSummary?: SummaryJson | null,
    siteOverride?: SiteSummary,
  ): Promise<string> => {
    const savedSite = siteOverride ?? (await resolveOperationSite())
    const state =
      freshSummary ??
      (summary?.site?.id === savedSite.id ? summary : await loadSummaryValue(savedSite.id))
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
    const detail = `运行 ${data.totalRuns ?? 0} 次，停止原因：${describePipelineStoppedReason(
      data.stoppedReason,
    )}`
    addLog(`本站工作流执行完成：${detail}`)
    return detail
  }

  const generateCategorySlots = async (siteOverride?: SiteSummary): Promise<string> => {
    const savedSite = siteOverride ?? (await resolveOperationSite())
    const mainProduct = siteProductPrompt(savedSite)
    await postJson('/api/admin/categories/generate-slots', {
      siteId: savedSite.id,
      ...(mainProduct ? { mainProduct } : {}),
      prepare: true,
    })
    const data = await postJson<{ okCount?: number; failCount?: number }>(
      '/api/admin/categories/generate-slots',
      {
        siteId: savedSite.id,
        ...(mainProduct ? { mainProduct } : {}),
        afterPrepare: true,
      },
    )
    const detail = `成功 ${data.okCount ?? 0}，失败 ${data.failCount ?? 0}`
    addLog(`分类槽位生成完成：${detail}`)
    return detail
  }

  const loadCategoriesForSite = async (siteId: number): Promise<CategoryOption[]> => {
    const res = await fetch(
      `/api/admin/article-quick-action/options?siteId=${encodeURIComponent(String(siteId))}`,
      { credentials: 'include' },
    )
    const data = (await res.json().catch(() => ({}))) as {
      categories?: CategoryOption[]
      error?: string
    }
    if (!res.ok) throw new Error(data.error ?? '加载分类失败')
    return data.categories ?? []
  }

  const fetchOffersForSite = async (
    siteOverride?: SiteSummary,
    progress?: ContentActionProgress,
  ): Promise<string> => {
    const savedSite = siteOverride ?? (await resolveOperationSite())
    progress?.('正在读取当前站点分类')
    const categories = await loadCategoriesForSite(savedSite.id)
    const slotted = categories.filter((cat) => cat.slotIndex != null && cat.slotIndex >= 1)
    const picked = (slotted.length > 0 ? slotted : categories).slice(0, 5)
    if (picked.length === 0) throw new Error('当前站点没有可拉品的分类')
    const categoryIds = picked.map((cat) => cat.id)
    const categoryById = new Map(picked.map((cat) => [cat.id, cat]))
    const categoryLabel = (cat: CategoryOption): string => cat.name || cat.slug || `分类 #${cat.id}`
    const categoryLabelById = (categoryId: number): string => {
      const cat = categoryById.get(categoryId)
      return cat ? categoryLabel(cat) : `分类 #${categoryId}`
    }
    const categoryListPreview = picked.map(categoryLabel).join('、')
    progress?.(`准备拉取 ${picked.length} 个分类：${categoryListPreview}`)
    const data = await postJson<{ batchId?: string; results?: unknown }>(
      '/api/admin/offers/merchant-slot-fetch',
      {
        siteId: savedSite.id,
        categoryIds,
        fetchAsinLimit: 5,
        force: false,
      },
    )
    const rows = Array.isArray(data.results) ? data.results : []
    const okCount = rows.filter((row) => (row as { ok?: unknown })?.ok === true).length
    const failCount = rows.length - okCount
    progress?.(
      `请求已发送：分类 ${picked.length} 个，派发成功 ${okCount}，失败 ${failCount}；等待 DataForSEO 返回`,
    )
    if (!data.batchId) {
      const detail = `分类 ${picked.length} 个，派发成功 ${okCount}，失败 ${failCount}；未返回 batchId，无法等待 DataForSEO 回调`
      progress?.(detail)
      addLog(`Offer 拉品已派发：${detail}`)
      return detail
    }

    addLog(`Offer 拉品已派发：分类 ${picked.length} 个，等待 DataForSEO 回调写入`)

    const deadline = Date.now() + 15 * 60_000
    let lastDetail = `分类 ${picked.length} 个，派发成功 ${okCount}，失败 ${failCount}；等待回调`
    while (Date.now() < deadline) {
      await sleep(2500)
      const qs = new URLSearchParams({
        siteId: String(savedSite.id),
        batchId: data.batchId,
        categoryIds: categoryIds.join(','),
      })
      const statusRes = await fetch(`/api/admin/offers/merchant-slot-dispatch-status?${qs}`, {
        credentials: 'include',
      })
      const statusData = (await statusRes.json().catch(() => ({}))) as {
        categories?: Array<{
          categoryId?: number
          batchMatches?: boolean
          merchantOfferFetchWorkflowStatus?: string | null
          logSnippet?: string
        }>
        error?: string
      }
      if (!statusRes.ok) throw new Error(statusData.error ?? `HTTP ${statusRes.status}`)
      const statusRows = Array.isArray(statusData.categories) ? statusData.categories : []
      const matched = statusRows.filter((row) => row.batchMatches === true)
      const done = matched.filter((row) => row.merchantOfferFetchWorkflowStatus === 'done')
      const errored = matched.filter((row) => row.merchantOfferFetchWorkflowStatus === 'error')
      const pending = Math.max(0, picked.length - done.length - errored.length)
      const doneIds = new Set(
        done
          .map((row) => row.categoryId)
          .filter((id): id is number => typeof id === 'number' && Number.isFinite(id)),
      )
      const erroredIds = new Set(
        errored
          .map((row) => row.categoryId)
          .filter((id): id is number => typeof id === 'number' && Number.isFinite(id)),
      )
      const pendingNames = picked
        .filter((cat) => !doneIds.has(cat.id) && !erroredIds.has(cat.id))
        .map(categoryLabel)
      const currentPending = pendingNames[0]
      lastDetail = `等待结果：已写回 ${done.length}/${picked.length}，失败 ${errored.length}，剩余 ${pending}${
        currentPending ? `；当前等待：${currentPending}` : ''
      }`
      progress?.(lastDetail)
      if (errored.length > 0) {
        const sample = errored.find((row) => row.logSnippet?.trim())?.logSnippet?.trim()
        const failedCategoryId = errored.find(
          (row) => typeof row.categoryId === 'number',
        )?.categoryId
        const failedCategory =
          typeof failedCategoryId === 'number' ? categoryLabelById(failedCategoryId) : '分类'
        throw new Error(sample ? `${lastDetail}；${failedCategory}：${sample}` : lastDetail)
      }
      if (done.length >= picked.length) {
        const detail = `完成：已写回 ${done.length}/${picked.length}，失败 ${errored.length}，剩余 0`
        progress?.(detail)
        addLog(`Offer 拉品完成：${detail}`)
        return detail
      }
    }

    throw new Error(`${lastDetail}；等待 DataForSEO 回调超时，请确认 postback URL 外网可访问`)
  }

  const loadOfferReviewOptionsForSite = async (siteId: number): Promise<OfferReviewOption[]> => {
    const res = await fetch(
      `/api/admin/offers/review-quick-action-options?siteId=${encodeURIComponent(String(siteId))}`,
      { credentials: 'include' },
    )
    const data = (await res.json().catch(() => ({}))) as {
      offers?: OfferReviewOption[]
      error?: string
    }
    if (!res.ok) throw new Error(data.error ?? '加载 Offer 失败')
    return Array.isArray(data.offers) ? data.offers : []
  }

  const generateOfferReviewsForSite = async (
    siteOverride?: SiteSummary,
    progress?: ContentActionProgress,
  ): Promise<string> => {
    const savedSite = siteOverride ?? (await resolveOperationSite())
    progress?.('正在读取当前站点 Offer')
    const offers = await loadOfferReviewOptionsForSite(savedSite.id)
    const pendingOffers = offers.filter(
      (offer) => offer.reviewStatus !== 'done' && offer.hasReviewArticle !== true,
    )
    if (offers.length === 0) throw new Error('当前站点没有可生成 Review 的 Offer')
    if (pendingOffers.length === 0) {
      const detail = `Review 已存在：当前站点 ${offers.length} 个 Offer 均已生成或已有关联文章，无需重复生成`
      progress?.(detail)
      addLog(detail)
      return detail
    }
    const concurrency = Math.min(5, Math.max(1, numberOr(reviewConcurrency, 5)))
    const batches: OfferReviewOption[][] = []
    for (let i = 0; i < pendingOffers.length; i += concurrency) {
      batches.push(pendingOffers.slice(i, i + concurrency))
    }

    let okTotal = 0
    let failTotal = 0
    let articleTotal = 0
    let executedTotal = 0
    progress?.(
      `准备生成整站 Review：待生成 ${pendingOffers.length} 篇，并发 ${concurrency}，共 ${batches.length} 批`,
    )

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i] ?? []
      const names = batch
        .map((offer) => offer.title || offer.asin || `Offer #${offer.id}`)
        .join('、')
      progress?.(
        `第 ${i + 1}/${batches.length} 批并发提交 ${batch.length} 篇：${names}；累计成功 ${okTotal}，失败 ${failTotal}，剩余 ${
          pendingOffers.length - executedTotal
        }`,
      )
      const data = await postJson<{
        okCount?: number
        total?: number
        results?: Array<{ offerId: number; ok: boolean; error?: string; articleId?: number }>
      }>('/api/admin/offers/generate-review-mdx', {
        offerIds: batch.map((offer) => offer.id),
        createArticle: true,
        locale: 'en',
      })
      const results = Array.isArray(data.results) ? data.results : []
      const batchOk = data.okCount ?? results.filter((row) => row.ok).length
      const batchTotal = data.total ?? results.length
      const batchFail = Math.max(0, batchTotal - batchOk)
      okTotal += batchOk
      failTotal += batchFail
      articleTotal += results.filter((row) => row.ok && row.articleId != null).length
      executedTotal += batchTotal
      progress?.(
        `第 ${i + 1}/${batches.length} 批完成：本批成功 ${batchOk}，失败 ${batchFail}；累计成功 ${okTotal}，失败 ${failTotal}，剩余 ${
          pendingOffers.length - executedTotal
        }`,
      )
    }

    const detail = `Review 生成完成：待生成 ${pendingOffers.length}，执行 ${executedTotal}，成功 ${okTotal}，失败 ${failTotal}，写入文章 ${articleTotal}`
    addLog(detail)
    return detail
  }

  const runInternalLinkTasks = async (siteOverride?: SiteSummary): Promise<string> => {
    const detail = await runSiteJobs(null, siteOverride)
    return `内链相关 pending 任务已纳入执行；${detail}`
  }

  const schedulePublish = async (siteOverride?: SiteSummary): Promise<string> => {
    const savedSite = siteOverride ?? (await resolveOperationSite())
    const siteId = savedSite.id
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
    const detail = `扫描 ${data.scanned ?? 0}，排期 ${data.queued ?? 0}，阻塞 ${data.blocked ?? 0}，每日上限 ${data.dailyPostCap ?? '—'}`
    addLog(`发布队列检查：${detail}`)
    return detail
  }

  const publishOnce = async (siteOverride?: SiteSummary): Promise<string> => {
    const savedSite = siteOverride ?? (await resolveOperationSite())
    const siteId = savedSite.id
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
    const detail = `扫描 ${data.scanned ?? 0}，发布 ${data.published ?? 0}，阻塞 ${data.blocked ?? 0}，跳过 ${data.skipped ?? 0}`
    addLog(`定时发布执行：${detail}`)
    return detail
  }

  const oneClickLaunch = async (): Promise<void> => {
    setLaunchSteps(initialLaunchSteps())
    const savedSite = await resolveOperationSite()

    try {
      updateLaunchStep('domain', 'running', '正在生成域名建议并校验可用性')
      await generateDomain(savedSite)
      updateLaunchStep('domain', 'done', '域名建议已生成并写回站点')
    } catch (e) {
      updateLaunchStep('domain', 'failed', e instanceof Error ? e.message : '域名建议生成失败')
      throw e
    }

    try {
      updateLaunchStep('design', 'running', '正在生成 AMZ 站点设计配置')
      await generateDesign(savedSite)
      updateLaunchStep('design', 'done', '设计已生成并写回设计记录')
    } catch (e) {
      updateLaunchStep('design', 'failed', e instanceof Error ? e.message : '设计生成失败')
      throw e
    }

    try {
      updateLaunchStep('trust', 'running', '正在生成五张基础信任页面')
      await generateTrustPages(savedSite)
      updateLaunchStep('trust', 'done', '信任页面已生成并写回')
    } catch (e) {
      updateLaunchStep('trust', 'failed', e instanceof Error ? e.message : '信任页面生成失败')
      throw e
    }

    await loadSummaryValue(savedSite.id).catch((): null => null)
  }

  const counts = summary?.counts
  const selectedOperationSite =
    selectedSiteId == null
      ? null
      : (sites.find((site) => site.id === selectedSiteId) ??
        (summary?.site?.id === selectedSiteId ? siteOptionFromSummary(summary.site) : null))
  const selectedOperationSiteId = selectedOperationSite?.id ?? selectedSiteId
  const siteScopedCollectionHref = (collection: ContentActionTarget): string =>
    adminCollectionHref(collection, selectedOperationSiteId)

  const operationSiteSelect = (label: string): React.ReactElement => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(260px, 520px) minmax(220px, 1fr)',
        gap: '0.75rem',
        alignItems: 'end',
        margin: '0.85rem 0',
      }}
    >
      <label>
        <span style={fieldLabel}>{label}</span>
        <select
          disabled={busy != null || sitesLoading}
          style={inputStyle}
          value={selectedSiteId ?? ''}
          onChange={(e) => {
            const next = e.target.value ? Number(e.target.value) : null
            currentSiteIdRef.current = next
            setSelectedSiteId(next)
            if (next == null) {
              setSummary(null)
              setPreset(null)
            }
          }}
        >
          <option value="">
            {sitesLoading ? '站点加载中…' : '未选择：使用上方站点记录创建 / 保存'}
          </option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {siteOptionLabel(site)}
            </option>
          ))}
        </select>
      </label>
      <div style={{ fontSize: '0.8125rem', opacity: 0.78, lineHeight: 1.45 }}>
        {selectedOperationSite
          ? `当前选中：${siteOptionLabel(selectedOperationSite)}`
          : '创建 / 保存站点记录成功后，这里会自动选中最新保存的站点。'}
      </div>
    </div>
  )

  const siteMetricsGrid = (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: '0.75rem',
        marginBottom: '1rem',
      }}
    >
      {[
        [
          '关键词 / eligible',
          `${counts?.keywordsTotal ?? '—'} / ${counts?.keywordsEligible ?? '—'}`,
        ],
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
  )

  return (
    <Gutter>
      <div style={{ padding: '2rem 0 3rem' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <h1 style={{ margin: '0 0 0.4rem', fontSize: '2rem' }}>站点启动操作面板</h1>
          <p style={{ margin: 0, maxWidth: 880, opacity: 0.82, lineHeight: 1.55 }}>
            员工在这里填写站点记录，然后按顺序完成前期建站内容流程。右侧快捷抽屉保留为单项补救工具；日常规模化操作以本面板为准。
          </p>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.05rem', marginTop: 0 }}>站点记录</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.75rem',
            }}
          >
            <label>
              <span style={fieldLabel}>标识名称</span>
              <input
                placeholder="后台识别名"
                style={inputStyle}
                value={siteRecord.name}
                onChange={(e) => updateSiteRecordField('name', e.target.value)}
              />
            </label>
            <label>
              <span style={fieldLabel}>Slug</span>
              <input
                placeholder="留空则按标识名称生成"
                style={inputStyle}
                value={siteRecord.slug}
                onChange={(e) => updateSiteRecordField('slug', e.target.value)}
              />
            </label>
            <label>
              <span style={fieldLabel}>主产品</span>
              <input
                placeholder="例如：Owala water bottles"
                style={inputStyle}
                value={siteRecord.mainProduct}
                onChange={(e) => updateSiteRecordField('mainProduct', e.target.value)}
              />
            </label>
            <label>
              <span style={fieldLabel}>主域名</span>
              <input
                placeholder="example.com"
                style={inputStyle}
                value={siteRecord.primaryDomain}
                onChange={(e) => updateSiteRecordField('primaryDomain', e.target.value)}
              />
            </label>
            <label>
              <span style={fieldLabel}>站点布局</span>
              <select
                style={inputStyle}
                value={siteRecord.siteLayout}
                onChange={(e) => updateSiteRecordField('siteLayout', e.target.value)}
              >
                {siteLayoutOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span style={fieldLabel}>状态</span>
              <select
                style={inputStyle}
                value={siteRecord.status}
                onChange={(e) => updateSiteRecordField('status', e.target.value)}
              >
                {siteStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span style={fieldLabel}>Amazon Tracking ID</span>
              <input
                placeholder="可选"
                style={inputStyle}
                value={siteRecord.defaultAmazonTrackingId}
                onChange={(e) => updateSiteRecordField('defaultAmazonTrackingId', e.target.value)}
              />
            </label>
            <label>
              <span style={fieldLabel}>推荐关键词策略</span>
              <select
                style={inputStyle}
                value={batchMode}
                onChange={(e) => setBatchMode(e.target.value)}
              >
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
              <input
                style={inputStyle}
                value={briefLimit}
                onChange={(e) => setBriefLimit(e.target.value)}
              />
            </label>
          </div>
          <label style={{ display: 'block', marginTop: '0.75rem' }}>
            <span style={fieldLabel}>备注</span>
            <textarea
              placeholder="站点启动备注、负责人协作信息等"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
              value={siteRecord.notes}
              onChange={(e) => updateSiteRecordField('notes', e.target.value)}
            />
          </label>

          <div style={{ marginTop: '0.75rem', fontSize: '0.8125rem', opacity: 0.86 }}>
            当前站点预设：{' '}
            {preset ? (
              <>
                {preset.name ?? preset.slug ?? '未命名预设'}
                {preset.batchMode ? ` · ${preset.batchMode}` : ''}
              </>
            ) : (
              '未设置，面板会使用你上面选择的策略'
            )}{' '}
            · 主产品： {siteRecord.mainProduct.trim() || '未填写'}
          </div>
          <div style={{ ...actionRowStyle, marginTop: '0.85rem' }}>
            <Button
              buttonStyle="secondary"
              disabled={busy != null}
              onClick={() =>
                void runAction('save-site-record', async () => {
                  await saveSiteRecord()
                })
              }
            >
              {selectedSiteId == null ? '创建站点记录' : '保存站点记录'}
            </Button>
            <Link
              href="/admin/collections/sites"
              prefetch={false}
              style={{ fontSize: '0.8125rem' }}
            >
              打开站点表格
            </Link>
          </div>
        </div>

        {error ? (
          <div style={{ ...cardStyle, color: 'var(--theme-error-500)' }}>{error}</div>
        ) : null}

        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.05rem', marginTop: 0 }}>一键启动</h2>
          <p style={{ fontSize: '0.8125rem', opacity: 0.82, lineHeight: 1.55 }}>
            按建站前置顺序生成域名建议、站点设计和基础信任页面。Brief
            排产、工作流执行和发布仍放在内容管理里，避免内容流程过早启动。
          </p>
          {operationSiteSelect('一键启动站点')}
          <div style={actionRowStyle}>
            <Button
              disabled={busy != null}
              onClick={() => void runAction('one-click', oneClickLaunch)}
            >
              {busy === 'one-click'
                ? `执行中：${launchSteps.find((step) => step.status === 'running')?.label ?? '准备中'}`
                : '一键启动建站准备'}
            </Button>
            <Button
              buttonStyle="secondary"
              disabled={busy != null}
              onClick={() =>
                void runAction('refresh', async () => {
                  await loadSummaryValue(currentSiteIdRef.current ?? undefined)
                  addLog('状态已刷新')
                })
              }
            >
              刷新状态
            </Button>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '0.6rem',
              marginTop: '1rem',
            }}
          >
            {launchSteps.map((step, index) => (
              <div
                key={step.id}
                style={{
                  padding: '0.75rem',
                  borderRadius: 8,
                  border: `1px solid ${step.status === 'running' ? '#d88b00' : 'var(--theme-elevation-150)'}`,
                  background:
                    step.status === 'running'
                      ? 'rgba(216, 139, 0, 0.12)'
                      : 'var(--theme-elevation-0)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    marginBottom: '0.35rem',
                  }}
                >
                  <strong style={{ fontSize: '0.85rem' }}>
                    {index + 1}. {step.label}
                  </strong>
                  <span
                    style={{
                      color: launchStepStatusColor(step.status),
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                  >
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

        {siteMetricsGrid}

        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.05rem', marginTop: 0 }}>内容管理</h2>
          <p style={{ fontSize: '0.8125rem', opacity: 0.82, lineHeight: 1.55 }}>
            按内容生产顺序操作：先生成分类，再按分类拉商品、生成 Review
            与拉关键词，然后生成文章、补内链并发布。
          </p>
          {operationSiteSelect('内容管理站点')}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '0.75rem',
            }}
          >
            <div style={metricStyle}>
              <h3 style={{ fontSize: '0.95rem', marginTop: 0 }}>1. 分类</h3>
              <p style={{ fontSize: '0.75rem', opacity: 0.78, lineHeight: 1.45 }}>
                先生成站点分类槽位，后续商品、关键词和文章都按分类承接。
              </p>
              <div style={actionRowStyle}>
                <Button
                  buttonStyle="secondary"
                  disabled={busy != null}
                  onClick={() =>
                    void runAction('category-slots', async () => {
                      await runContentActionWithBanner(
                        '生成分类槽位',
                        'categories',
                        generateCategorySlots,
                      )
                    })
                  }
                >
                  生成分类槽位
                </Button>
                <Link
                  href={siteScopedCollectionHref('categories')}
                  prefetch={false}
                  style={contentLinkStyle}
                >
                  打开分类
                </Link>
              </div>
            </div>

            <div style={metricStyle}>
              <h3 style={{ fontSize: '0.95rem', marginTop: 0 }}>2. Offer / 商品</h3>
              <p style={{ fontSize: '0.75rem', opacity: 0.78, lineHeight: 1.45 }}>
                根据分类槽位拉取 Amazon 商品，补齐后续测评与 money page 素材。
              </p>
              <div style={actionRowStyle}>
                <Button
                  buttonStyle="secondary"
                  disabled={busy != null}
                  onClick={() =>
                    void runAction('offer-fetch', async () => {
                      await runContentActionWithBanner('Offer 拉品', 'offers', fetchOffersForSite)
                    })
                  }
                >
                  拉取商品
                </Button>
                <Link
                  href={siteScopedCollectionHref('offers')}
                  prefetch={false}
                  style={contentLinkStyle}
                >
                  打开 Offer
                </Link>
              </div>
            </div>

            <div style={metricStyle}>
              <h3 style={{ fontSize: '0.95rem', marginTop: 0 }}>3. Review 文章</h3>
              <p style={{ fontSize: '0.75rem', opacity: 0.78, lineHeight: 1.45 }}>
                根据商品素材生成 Review 文章，承接 Amazon 商品测评与 money page 内链。
              </p>
              <label style={{ display: 'block', marginBottom: '0.75rem' }}>
                <span style={fieldLabel}>并发篇数（最多 5）</span>
                <input
                  style={inputStyle}
                  value={reviewConcurrency}
                  onChange={(e) => setReviewConcurrency(e.target.value)}
                />
              </label>
              <div style={actionRowStyle}>
                <Button
                  buttonStyle="secondary"
                  disabled={busy != null}
                  onClick={() =>
                    void runAction('offer-review', async () => {
                      await runContentActionWithBanner(
                        '生成 Review',
                        'articles',
                        generateOfferReviewsForSite,
                      )
                    })
                  }
                >
                  生成 Review
                </Button>
                <Link
                  href={siteScopedCollectionHref('articles')}
                  prefetch={false}
                  style={contentLinkStyle}
                >
                  查看文章
                </Link>
                <Link
                  href={siteScopedCollectionHref('offers')}
                  prefetch={false}
                  style={contentLinkStyle}
                >
                  打开 Offer
                </Link>
              </div>
            </div>

            <div style={metricStyle}>
              <h3 style={{ fontSize: '0.95rem', marginTop: 0 }}>4. 关键词</h3>
              <p style={{ fontSize: '0.75rem', opacity: 0.78, lineHeight: 1.45 }}>
                根据分类名称拉词，筛选 eligible / opportunity，确定可排产关键词。
              </p>
              <div style={actionRowStyle}>
                <Button
                  buttonStyle="secondary"
                  disabled={busy != null}
                  onClick={() =>
                    void runAction('keywords-sync', async () => {
                      await runContentActionWithBanner('拉取关键词', 'keywords', syncKeywords)
                    })
                  }
                >
                  拉取关键词
                </Button>
                <Link
                  href={siteScopedCollectionHref('keywords')}
                  prefetch={false}
                  style={contentLinkStyle}
                >
                  打开关键词
                </Link>
              </div>
            </div>

            <div style={metricStyle}>
              <h3 style={{ fontSize: '0.95rem', marginTop: 0 }}>5. 内容大纲</h3>
              <p style={{ fontSize: '0.75rem', opacity: 0.78, lineHeight: 1.45 }}>
                按站点表格里的关键词预设和流水线创建 Brief，只生成大纲，不接文章草稿。
              </p>
              <div style={actionRowStyle}>
                <Button
                  disabled={busy != null}
                  onClick={() =>
                    void runAction('generate-outlines', async () => {
                      await runContentActionWithBanner(
                        '生成内容大纲',
                        'content-briefs',
                        generateOutlines,
                      )
                    })
                  }
                >
                  生成内容大纲
                </Button>
                <Link
                  href={siteScopedCollectionHref('content-briefs')}
                  prefetch={false}
                  style={contentLinkStyle}
                >
                  查看大纲
                </Link>
              </div>
            </div>

            <div style={metricStyle}>
              <h3 style={{ fontSize: '0.95rem', marginTop: 0 }}>6. 文章草稿</h3>
              <p style={{ fontSize: '0.75rem', opacity: 0.78, lineHeight: 1.45 }}>
                从已有 Brief 排产草稿，并交给后端 Runner 继续生成正文、收尾任务。
              </p>
              <div style={actionRowStyle}>
                <Button
                  disabled={busy != null}
                  onClick={() =>
                    void runAction('generate-article-drafts', async () => {
                      await runContentActionWithBanner(
                        '生成文章草稿',
                        'workflow-jobs',
                        generateArticleDrafts,
                      )
                    })
                  }
                >
                  生成文章草稿
                </Button>
                <Link
                  href={siteScopedCollectionHref('articles')}
                  prefetch={false}
                  style={contentLinkStyle}
                >
                  查看文章
                </Link>
                <Link
                  href={siteScopedCollectionHref('workflow-jobs')}
                  prefetch={false}
                  style={contentLinkStyle}
                >
                  查看工作流
                </Link>
              </div>
            </div>

            <div style={metricStyle}>
              <h3 style={{ fontSize: '0.95rem', marginTop: 0 }}>7. 待处理任务</h3>
              <p style={{ fontSize: '0.75rem', opacity: 0.78, lineHeight: 1.45 }}>
                生成内容中断或失败后，用这里继续执行本站 pending 工作流任务。
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.5rem',
                  marginBottom: '0.75rem',
                }}
              >
                <label>
                  <span style={fieldLabel}>最多运行次数</span>
                  <input
                    style={inputStyle}
                    value={runMaxRuns}
                    onChange={(e) => setRunMaxRuns(e.target.value)}
                  />
                </label>
                <label>
                  <span style={fieldLabel}>预算秒数</span>
                  <input
                    style={inputStyle}
                    value={runBudgetSeconds}
                    onChange={(e) => setRunBudgetSeconds(e.target.value)}
                  />
                </label>
              </div>
              <Button
                buttonStyle="secondary"
                disabled={
                  busy != null ||
                  (selectedSiteId != null && (summary?.pendingJobIds?.length ?? 0) === 0)
                }
                onClick={() =>
                  void runAction('run-jobs', async () => {
                    await runContentActionWithBanner(
                      '继续运行待处理任务',
                      'workflow-jobs',
                      (site) => runSiteJobs(undefined, site),
                    )
                  })
                }
              >
                继续运行待处理任务
              </Button>
              <div style={{ ...actionRowStyle, marginTop: '0.65rem' }}>
                <Link
                  href={siteScopedCollectionHref('articles')}
                  prefetch={false}
                  style={contentLinkStyle}
                >
                  查看文章
                </Link>
                <Link
                  href={siteScopedCollectionHref('workflow-jobs')}
                  prefetch={false}
                  style={contentLinkStyle}
                >
                  查看工作流
                </Link>
              </div>
            </div>

            <div style={metricStyle}>
              <h3 style={{ fontSize: '0.95rem', marginTop: 0 }}>8. 文章内链</h3>
              <p style={{ fontSize: '0.75rem', opacity: 0.78, lineHeight: 1.45 }}>
                查看 PageLinkGraph、内链注入 / 强化任务和 money page 内链健康。
              </p>
              <div style={actionRowStyle}>
                <Button
                  buttonStyle="secondary"
                  disabled={
                    busy != null ||
                    (selectedSiteId != null && (summary?.pendingJobIds?.length ?? 0) === 0)
                  }
                  onClick={() =>
                    void runAction('internal-links', async () => {
                      await runContentActionWithBanner(
                        '执行内链任务',
                        'page-link-graph',
                        runInternalLinkTasks,
                      )
                    })
                  }
                >
                  执行内链任务
                </Button>
                <Link
                  href={siteScopedCollectionHref('page-link-graph')}
                  prefetch={false}
                  style={contentLinkStyle}
                >
                  查看内链图
                </Link>
                <Link
                  href={siteScopedCollectionHref('workflow-jobs')}
                  prefetch={false}
                  style={contentLinkStyle}
                >
                  内链任务
                </Link>
              </div>
            </div>

            <div style={metricStyle}>
              <h3 style={{ fontSize: '0.95rem', marginTop: 0 }}>9. 发布与刷新</h3>
              <p style={{ fontSize: '0.75rem', opacity: 0.78, lineHeight: 1.45 }}>
                按质量分门槛加入发布队列，或执行一次本站排期发布。
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.5rem',
                  marginBottom: '0.75rem',
                }}
              >
                <label>
                  <span style={fieldLabel}>发布排队数量</span>
                  <input
                    style={inputStyle}
                    value={publishLimit}
                    onChange={(e) => setPublishLimit(e.target.value)}
                  />
                </label>
                <label>
                  <span style={fieldLabel}>最低质量分</span>
                  <input
                    style={inputStyle}
                    value={minQualityScore}
                    onChange={(e) => setMinQualityScore(e.target.value)}
                  />
                </label>
              </div>
              <div style={actionRowStyle}>
                <Button
                  buttonStyle="secondary"
                  disabled={busy != null}
                  onClick={() =>
                    void runAction('schedule-publish', async () => {
                      await runContentActionWithBanner('加入发布队列', 'articles', schedulePublish)
                    })
                  }
                >
                  加入发布队列
                </Button>
                <Button
                  buttonStyle="secondary"
                  disabled={busy != null}
                  onClick={() =>
                    void runAction('publish-once', async () => {
                      await runContentActionWithBanner('执行一次发布', 'articles', publishOnce)
                    })
                  }
                >
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
