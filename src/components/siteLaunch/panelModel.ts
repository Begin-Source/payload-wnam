
import React from 'react'
import type { BackgroundActivityJob } from '@/components/adminBackgroundActivity/AdminBackgroundActivityContext'

export type PresetJson = {
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

export type SummaryJson = {
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
    briefGenerateJobsPending?: number
    briefGenerateJobsRunning?: number
    dailyPostCap: number
  }
  pendingJobIds?: number[]
}

export type SiteSummary = NonNullable<SummaryJson['site']>

export type SiteRecordForm = {
  name: string
  slug: string
  primaryDomain: string
  mainProduct: string
  siteLayout: string
  status: string
  defaultAmazonTrackingId: string
  notes: string
}

export type SiteOption = {
  id: number
  name: string
  slug: string
  primaryDomain?: string | null
  mainProduct?: string | null
  siteLayout?: string | null
}

export type CategoryOption = {
  id: number
  name: string
  slug: string
  slotIndex?: number | null
  kind?: 'article' | 'guide' | 'review' | null
}

export type OfferReviewOption = {
  id: number
  title: string
  asin?: string | null
  hasReviewArticle?: boolean
  reviewStatus?: string | null
}

export type ContentActionTarget = NonNullable<
  NonNullable<BackgroundActivityJob['contentManagementActionSummary']>['targetCollection']
>

export type ContentActionProgress = (detail: string) => void

export type LaunchStepId = 'domain' | 'design' | 'trust'

export type LaunchStepStatus = 'idle' | 'running' | 'done' | 'failed'

export type LaunchStep = {
  id: LaunchStepId
  label: string
  description: string
  status: LaunchStepStatus
  detail?: string
}

export function describePipelineStoppedReason(reason: string | null | undefined): string {
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

export const launchStepTemplates: Array<Omit<LaunchStep, 'status' | 'detail'>> = [
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

export const emptySiteRecordForm: SiteRecordForm = {
  name: '',
  slug: '',
  primaryDomain: '',
  mainProduct: '',
  siteLayout: 'amz-template-1',
  status: 'draft',
  defaultAmazonTrackingId: '',
  notes: '',
}

export const siteLayoutOptions = [
  { label: 'AMZ Template 1', value: 'amz-template-1' },
  { label: 'AMZ Template 2', value: 'amz-template-2' },
  { label: 'Template 1', value: 'template1' },
  { label: 'Template 2', value: 'template2' },
]

export const siteStatusOptions = [
  { label: 'Draft', value: 'draft' },
  { label: 'Active', value: 'active' },
  { label: 'Archived', value: 'archived' },
]

export function initialLaunchSteps(): LaunchStep[] {
  return launchStepTemplates.map((step) => ({ ...step, status: 'idle' }))
}

export function launchStepStatusLabel(status: LaunchStepStatus): string {
  if (status === 'running') return '执行中'
  if (status === 'done') return '完成'
  if (status === 'failed') return '失败'
  return '等待'
}

export function launchStepStatusColor(status: LaunchStepStatus): string {
  if (status === 'running') return '#d88b00'
  if (status === 'done') return '#2e7d32'
  if (status === 'failed') return '#c62828'
  return 'var(--theme-elevation-500)'
}

export const cardStyle: React.CSSProperties = {
  padding: '1rem',
  borderRadius: 8,
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-50)',
  marginBottom: '1rem',
}

export const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 600,
  marginBottom: '0.35rem',
  opacity: 0.85,
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.65rem',
  borderRadius: 4,
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-0)',
  color: 'inherit',
  fontSize: '0.875rem',
}

export const metricStyle: React.CSSProperties = {
  padding: '0.75rem',
  borderRadius: 8,
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-0)',
}

export const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  flexWrap: 'wrap',
  alignItems: 'center',
}

export const contentLinkStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  textDecoration: 'underline',
  textUnderlineOffset: 3,
}

export function numberOr(value: string, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

export function activeBriefGenerateJobs(summaryValue: SummaryJson | null | undefined): number {
  const pending = summaryValue?.counts?.briefGenerateJobsPending
  const running = summaryValue?.counts?.briefGenerateJobsRunning
  return (typeof pending === 'number' ? pending : 0) + (typeof running === 'number' ? running : 0)
}

export function siteRecordFormFromSite(site: Partial<SiteSummary> | null | undefined): SiteRecordForm {
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

export function siteOptionLabel(site: SiteOption): string {
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

export function siteOptionFromSummary(site: SiteSummary): SiteOption {
  return {
    id: site.id,
    name: site.name,
    slug: site.slug,
    primaryDomain: site.primaryDomain,
    mainProduct: site.mainProduct,
    siteLayout: site.siteLayout,
  }
}

export function siteProductPrompt(site: Pick<SiteSummary, 'mainProduct' | 'name' | 'slug'>): string {
  return (
    (typeof site.mainProduct === 'string' ? site.mainProduct.trim() : '') ||
    site.name.trim() ||
    site.slug.trim()
  )
}

export async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
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

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function adminCollectionHref(collection: ContentActionTarget, siteId?: number | null): string {
  const base = `/admin/collections/${collection}`
  if (typeof siteId !== 'number' || !Number.isFinite(siteId)) return base
  const encodedSiteId = encodeURIComponent(String(siteId))
  if (collection === 'offers') return `${base}?where[sites][contains]=${encodedSiteId}`
  return `${base}?where[site][equals]=${encodedSiteId}`
}

export function parseSiteIdParam(value: string | null | undefined): number | null {
  if (!value) return null
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

export function readInitialSelectedSiteId(): number | null {
  if (typeof window === 'undefined') return null
  return parseSiteIdParam(new URLSearchParams(window.location.search).get('siteId'))
}
