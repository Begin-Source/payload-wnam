'use client'

import {
  AdminBackgroundActivityReactContext,
  type AdminBackgroundActivityApi,
  type BackgroundActivityJob,
  type CategoryCoverSyncRowResult,
  type CategorySlotsSyncRowResult,
  type MerchantSlotDispatchRowResult,
  type WorkflowJobsPipelineSummary,
} from '@/components/adminBackgroundActivity/AdminBackgroundActivityContext'
import { AdminBackgroundActivityBanner } from '@/components/adminBackgroundActivity/AdminBackgroundActivityBanner'
import type { ReactElement, ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

export { useAdminBackgroundActivity } from '@/components/adminBackgroundActivity/AdminBackgroundActivityContext'

const POLL_MS = 2000
const POLL_CAP_MS = 120_000
/** Merchant 拉品：派发后等 Webhook 写 Offer，列表刷新稍长 */
const POLL_CAP_MS_MERCHANT = 15 * 60_000
/** 信任页包：OpenRouter 单次生成可能超过 120s */
const POLL_CAP_MS_TRUST_PAGES_BUNDLE = 6 * 60_000
/** DataForSEO 关键词 Labs / Quick-win SERP 预览等可能超过 120s */
const POLL_CAP_MS_KEYWORDS_LONG = 6 * 60_000
/** Pipeline run-next 多批 drain 可能在后台持续较久 */
const POLL_CAP_MS_WORKFLOW_PIPELINE = 30 * 60_000

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `bg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export function AdminBackgroundActivityProvider({
  children,
}: {
  children: ReactNode
}): ReactElement {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const [jobs, setJobs] = useState<BackgroundActivityJob[]>([])

  const dismissJob = useCallback((jobId: string): void => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId))
  }, [])

  const refreshIfCategoriesList = useCallback((): void => {
    if (typeof window !== 'undefined' && pathname.includes('/collections/categories')) {
      router.refresh()
    }
  }, [pathname, router])

  const refreshIfCategoriesOrOffersList = useCallback((): void => {
    if (typeof window === 'undefined') return
    if (pathname.includes('/collections/categories') || pathname.includes('/collections/offers')) {
      router.refresh()
    }
  }, [pathname, router])

  const refreshIfPagesList = useCallback((): void => {
    if (typeof window !== 'undefined' && pathname.includes('/collections/pages')) {
      router.refresh()
    }
  }, [pathname, router])

  const refreshIfKeywordsList = useCallback((): void => {
    if (typeof window !== 'undefined' && pathname.includes('/collections/keywords')) {
      router.refresh()
    }
  }, [pathname, router])

  const refreshIfWorkflowJobsList = useCallback((): void => {
    if (typeof window !== 'undefined' && pathname.includes('/collections/workflow-jobs')) {
      router.refresh()
    }
  }, [pathname, router])

  const refreshIfContentBriefsList = useCallback((): void => {
    if (typeof window !== 'undefined' && pathname.includes('/collections/content-briefs')) {
      router.refresh()
    }
  }, [pathname, router])

  const refreshIfSitesList = useCallback((): void => {
    if (typeof window !== 'undefined' && pathname.includes('/collections/sites')) {
      router.refresh()
    }
  }, [pathname, router])

  const refreshIfOffersList = useCallback((): void => {
    if (typeof window !== 'undefined' && pathname.includes('/collections/offers')) {
      router.refresh()
    }
  }, [pathname, router])

  const refreshIfArticlesList = useCallback((): void => {
    if (typeof window !== 'undefined' && pathname.includes('/collections/articles')) {
      router.refresh()
    }
  }, [pathname, router])

  const refreshIfPageLinkGraphList = useCallback((): void => {
    if (typeof window !== 'undefined' && pathname.includes('/collections/page-link-graph')) {
      router.refresh()
    }
  }, [pathname, router])

  const refreshIfContentManagementTargetList = useCallback((): void => {
    refreshIfCategoriesList()
    refreshIfOffersList()
    refreshIfKeywordsList()
    refreshIfContentBriefsList()
    refreshIfArticlesList()
    refreshIfWorkflowJobsList()
    refreshIfPageLinkGraphList()
  }, [
    refreshIfCategoriesList,
    refreshIfOffersList,
    refreshIfKeywordsList,
    refreshIfContentBriefsList,
    refreshIfArticlesList,
    refreshIfWorkflowJobsList,
    refreshIfPageLinkGraphList,
  ])

  const hasRunningCategoriesListWork = jobs.some(
    (j) =>
      j.phase === 'running' &&
      (j.kind === 'category-cover-sync' ||
        j.kind === 'category-slots-sync' ||
        j.kind === 'merchant-slot-dispatch-sync'),
  )

  const hasRunningMerchantCategoriesWork = jobs.some(
    (j) => j.phase === 'running' && j.kind === 'merchant-slot-dispatch-sync',
  )

  const hasRunningTrustPagesBundleWork = jobs.some(
    (j) => j.phase === 'running' && j.kind === 'trust-pages-bundle-sync',
  )

  const hasRunningKeywordsDfsFetchWork = jobs.some(
    (j) => j.phase === 'running' && j.kind === 'keywords-dfs-fetch-sync',
  )

  const hasRunningKeywordQuickWinPreviewWork = jobs.some(
    (j) => j.phase === 'running' && j.kind === 'keyword-quick-win-preview-sync',
  )

  const hasRunningKeywordBatchModePreviewWork = jobs.some(
    (j) => j.phase === 'running' && j.kind === 'keyword-batch-mode-preview-sync',
  )

  const hasRunningContentBriefDraftSkeletonPreviewWork = jobs.some(
    (j) => j.phase === 'running' && j.kind === 'content-brief-draft-skeleton-preview-sync',
  )

  const hasRunningWorkflowJobsPipelineWork = jobs.some(
    (j) => j.phase === 'running' && j.kind === 'workflow-jobs-pipeline-sync',
  )

  const hasRunningBatchEnqueueWork = jobs.some(
    (j) => j.phase === 'running' && j.kind === 'batch-enqueue-sync',
  )

  const hasRunningSiteRecordSaveWork = jobs.some(
    (j) => j.phase === 'running' && j.kind === 'site-record-save-sync',
  )

  const hasRunningContentManagementActionWork = jobs.some(
    (j) => j.phase === 'running' && j.kind === 'content-management-action-sync',
  )

  const hasRunningListPollWork =
    hasRunningCategoriesListWork ||
    hasRunningTrustPagesBundleWork ||
    hasRunningKeywordsDfsFetchWork ||
    hasRunningKeywordQuickWinPreviewWork ||
    hasRunningKeywordBatchModePreviewWork ||
    hasRunningContentBriefDraftSkeletonPreviewWork ||
    hasRunningBatchEnqueueWork ||
    hasRunningWorkflowJobsPipelineWork ||
    hasRunningSiteRecordSaveWork ||
    hasRunningContentManagementActionWork

  useEffect(() => {
    if (!hasRunningListPollWork) return

    const interval = window.setInterval(() => {
      refreshIfCategoriesList()
      refreshIfPagesList()
      refreshIfKeywordsList()
      refreshIfWorkflowJobsList()
      refreshIfContentBriefsList()
      refreshIfSitesList()
      refreshIfOffersList()
      refreshIfArticlesList()
      refreshIfPageLinkGraphList()
    }, POLL_MS)
    let capMs = POLL_CAP_MS
    if (hasRunningMerchantCategoriesWork) capMs = Math.max(capMs, POLL_CAP_MS_MERCHANT)
    if (hasRunningTrustPagesBundleWork) capMs = Math.max(capMs, POLL_CAP_MS_TRUST_PAGES_BUNDLE)
    if (
      hasRunningKeywordsDfsFetchWork ||
      hasRunningKeywordQuickWinPreviewWork ||
      hasRunningKeywordBatchModePreviewWork
    ) {
      capMs = Math.max(capMs, POLL_CAP_MS_KEYWORDS_LONG)
    }
    if (hasRunningWorkflowJobsPipelineWork) {
      capMs = Math.max(capMs, POLL_CAP_MS_WORKFLOW_PIPELINE)
    }
    if (hasRunningBatchEnqueueWork) {
      capMs = Math.max(capMs, POLL_CAP_MS_KEYWORDS_LONG)
    }
    if (hasRunningContentBriefDraftSkeletonPreviewWork) {
      capMs = Math.max(capMs, POLL_CAP_MS_KEYWORDS_LONG)
    }
    if (hasRunningContentManagementActionWork) {
      capMs = Math.max(capMs, POLL_CAP_MS_KEYWORDS_LONG)
    }
    const cap = window.setTimeout(() => {
      window.clearInterval(interval)
    }, capMs)

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(cap)
    }
  }, [
    hasRunningListPollWork,
    hasRunningMerchantCategoriesWork,
    hasRunningTrustPagesBundleWork,
    hasRunningKeywordsDfsFetchWork,
    hasRunningKeywordQuickWinPreviewWork,
    hasRunningKeywordBatchModePreviewWork,
    hasRunningContentBriefDraftSkeletonPreviewWork,
    hasRunningBatchEnqueueWork,
    hasRunningWorkflowJobsPipelineWork,
    hasRunningSiteRecordSaveWork,
    hasRunningContentManagementActionWork,
    refreshIfCategoriesList,
    refreshIfPagesList,
    refreshIfKeywordsList,
    refreshIfWorkflowJobsList,
    refreshIfContentBriefsList,
    refreshIfSitesList,
    refreshIfOffersList,
    refreshIfArticlesList,
    refreshIfPageLinkGraphList,
  ])

  const startCategoryCoverJob = useCallback(
    ({ categoryCount }: { categoryCount: number }): string => {
      const id = newId()
      const job: BackgroundActivityJob = {
        id,
        kind: 'category-cover-sync',
        phase: 'running',
        categoryCount,
        startedAt: Date.now(),
      }
      setJobs((prev) => [...prev, job])
      refreshIfCategoriesList()
      return id
    },
    [refreshIfCategoriesList],
  )

  const completeCategoryCoverJob = useCallback(
    ({
      jobId,
      okCount,
      failCount,
      results,
    }: {
      jobId: string
      okCount: number
      failCount: number
      results?: CategoryCoverSyncRowResult[]
    }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'category-cover-sync'
            ? {
                ...j,
                phase: 'succeeded',
                okCount,
                failCount,
                ...(Array.isArray(results) && results.length > 0
                  ? { coverSyncResults: results }
                  : {}),
              }
            : j,
        ),
      )
      refreshIfCategoriesList()
    },
    [refreshIfCategoriesList],
  )

  const failCategoryCoverJob = useCallback(
    ({ jobId, message }: { jobId: string; message: string }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'category-cover-sync'
            ? {
                ...j,
                phase: 'failed',
                errorMessage: message,
              }
            : j,
        ),
      )
      refreshIfCategoriesList()
    },
    [refreshIfCategoriesList],
  )

  const startCategorySlotsJob = useCallback(
    ({ siteLabel }: { siteLabel?: string } = {}): string => {
      const id = newId()
      const job: BackgroundActivityJob = {
        id,
        kind: 'category-slots-sync',
        phase: 'running',
        ...(siteLabel?.trim() ? { siteLabel: siteLabel.trim() } : {}),
        startedAt: Date.now(),
      }
      setJobs((prev) => [...prev, job])
      refreshIfCategoriesList()
      return id
    },
    [refreshIfCategoriesList],
  )

  const completeCategorySlotsJob = useCallback(
    ({
      jobId,
      okCount,
      failCount,
      results,
    }: {
      jobId: string
      okCount?: number
      failCount?: number
      results?: CategorySlotsSyncRowResult[]
    }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'category-slots-sync'
            ? {
                ...j,
                phase: 'succeeded',
                ...(typeof okCount === 'number' ? { okCount } : {}),
                ...(typeof failCount === 'number' ? { failCount } : {}),
                ...(Array.isArray(results) && results.length > 0
                  ? { slotsSyncResults: results }
                  : {}),
              }
            : j,
        ),
      )
      refreshIfCategoriesList()
    },
    [refreshIfCategoriesList],
  )

  const failCategorySlotsJob = useCallback(
    ({ jobId, message }: { jobId: string; message: string }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'category-slots-sync'
            ? {
                ...j,
                phase: 'failed',
                errorMessage: message,
              }
            : j,
        ),
      )
      refreshIfCategoriesList()
    },
    [refreshIfCategoriesList],
  )

  const startMerchantSlotDispatchJob = useCallback(
    ({ categoryCount, siteLabel }: { categoryCount: number; siteLabel?: string }): string => {
      const id = newId()
      const job: BackgroundActivityJob = {
        id,
        kind: 'merchant-slot-dispatch-sync',
        phase: 'running',
        categoryCount,
        ...(siteLabel?.trim() ? { siteLabel: siteLabel.trim() } : {}),
        startedAt: Date.now(),
      }
      setJobs((prev) => [...prev, job])
      refreshIfCategoriesList()
      return id
    },
    [refreshIfCategoriesList],
  )

  const completeMerchantSlotDispatchJob = useCallback(
    ({
      jobId,
      okCount,
      failCount,
      batchId,
      results,
    }: {
      jobId: string
      okCount: number
      failCount: number
      batchId?: string
      results?: MerchantSlotDispatchRowResult[]
    }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'merchant-slot-dispatch-sync'
            ? {
                ...j,
                phase: 'succeeded',
                okCount,
                failCount,
                ...(batchId?.trim() ? { batchId: batchId.trim() } : {}),
                ...(Array.isArray(results) && results.length > 0
                  ? { merchantSlotDispatchResults: results }
                  : {}),
              }
            : j,
        ),
      )
      refreshIfCategoriesOrOffersList()
    },
    [refreshIfCategoriesOrOffersList],
  )

  const failMerchantSlotDispatchJob = useCallback(
    ({ jobId, message }: { jobId: string; message: string }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'merchant-slot-dispatch-sync'
            ? {
                ...j,
                phase: 'failed',
                errorMessage: message,
              }
            : j,
        ),
      )
      refreshIfCategoriesOrOffersList()
    },
    [refreshIfCategoriesOrOffersList],
  )

  const startTrustPagesBundleJob = useCallback(
    ({ siteLabel }: { siteLabel?: string } = {}): string => {
      const id = newId()
      const job: BackgroundActivityJob = {
        id,
        kind: 'trust-pages-bundle-sync',
        phase: 'running',
        ...(siteLabel?.trim() ? { siteLabel: siteLabel.trim() } : {}),
        startedAt: Date.now(),
      }
      setJobs((prev) => [...prev, job])
      refreshIfPagesList()
      return id
    },
    [refreshIfPagesList],
  )

  const completeTrustPagesBundleJob = useCallback(
    ({ jobId, slugs, locale }: { jobId: string; slugs?: string[]; locale?: string }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'trust-pages-bundle-sync'
            ? {
                ...j,
                phase: 'succeeded',
                okCount: 1,
                failCount: 0,
                ...(locale?.trim() ? { trustPagesBundleLocale: locale.trim() } : {}),
                ...(Array.isArray(slugs) && slugs.length > 0
                  ? { trustPagesBundleSlugs: slugs }
                  : {}),
              }
            : j,
        ),
      )
      refreshIfPagesList()
    },
    [refreshIfPagesList],
  )

  const failTrustPagesBundleJob = useCallback(
    ({ jobId, message }: { jobId: string; message: string }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'trust-pages-bundle-sync'
            ? {
                ...j,
                phase: 'failed',
                errorMessage: message,
              }
            : j,
        ),
      )
      refreshIfPagesList()
    },
    [refreshIfPagesList],
  )

  const startKeywordsDfsFetchJob = useCallback(
    ({ siteLabel }: { siteLabel?: string } = {}): string => {
      const id = newId()
      const job: BackgroundActivityJob = {
        id,
        kind: 'keywords-dfs-fetch-sync',
        phase: 'running',
        ...(siteLabel?.trim() ? { siteLabel: siteLabel.trim() } : {}),
        startedAt: Date.now(),
      }
      setJobs((prev) => [...prev, job])
      refreshIfKeywordsList()
      return id
    },
    [refreshIfKeywordsList],
  )

  const completeKeywordsDfsFetchJob = useCallback(
    ({
      jobId,
      summary,
    }: {
      jobId: string
      summary: NonNullable<BackgroundActivityJob['keywordDfsFetchSummary']>
    }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'keywords-dfs-fetch-sync'
            ? {
                ...j,
                phase: 'succeeded',
                keywordDfsFetchSummary: summary,
              }
            : j,
        ),
      )
      refreshIfKeywordsList()
    },
    [refreshIfKeywordsList],
  )

  const failKeywordsDfsFetchJob = useCallback(
    ({ jobId, message }: { jobId: string; message: string }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'keywords-dfs-fetch-sync'
            ? {
                ...j,
                phase: 'failed',
                errorMessage: message,
              }
            : j,
        ),
      )
      refreshIfKeywordsList()
    },
    [refreshIfKeywordsList],
  )

  const startKeywordQuickWinPreviewJob = useCallback(
    ({ siteLabel }: { siteLabel?: string } = {}): string => {
      const id = newId()
      const job: BackgroundActivityJob = {
        id,
        kind: 'keyword-quick-win-preview-sync',
        phase: 'running',
        ...(siteLabel?.trim() ? { siteLabel: siteLabel.trim() } : {}),
        startedAt: Date.now(),
      }
      setJobs((prev) => [...prev, job])
      refreshIfKeywordsList()
      return id
    },
    [refreshIfKeywordsList],
  )

  const completeKeywordQuickWinPreviewJob = useCallback(
    ({
      jobId,
      summary,
    }: {
      jobId: string
      summary: NonNullable<BackgroundActivityJob['keywordQuickWinPreviewSummary']>
    }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'keyword-quick-win-preview-sync'
            ? {
                ...j,
                phase: 'succeeded',
                keywordQuickWinPreviewSummary: summary,
              }
            : j,
        ),
      )
      refreshIfKeywordsList()
    },
    [refreshIfKeywordsList],
  )

  const failKeywordQuickWinPreviewJob = useCallback(
    ({ jobId, message }: { jobId: string; message: string }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'keyword-quick-win-preview-sync'
            ? {
                ...j,
                phase: 'failed',
                errorMessage: message,
              }
            : j,
        ),
      )
      refreshIfKeywordsList()
    },
    [refreshIfKeywordsList],
  )

  const startKeywordBatchModePreviewJob = useCallback(
    ({ siteLabel }: { siteLabel?: string } = {}): string => {
      const id = newId()
      const job: BackgroundActivityJob = {
        id,
        kind: 'keyword-batch-mode-preview-sync',
        phase: 'running',
        ...(siteLabel?.trim() ? { siteLabel: siteLabel.trim() } : {}),
        startedAt: Date.now(),
      }
      setJobs((prev) => [...prev, job])
      refreshIfKeywordsList()
      return id
    },
    [refreshIfKeywordsList],
  )

  const completeKeywordBatchModePreviewJob = useCallback(
    ({
      jobId,
      summary,
    }: {
      jobId: string
      summary: NonNullable<BackgroundActivityJob['keywordBatchModePreviewSummary']>
    }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'keyword-batch-mode-preview-sync'
            ? {
                ...j,
                phase: 'succeeded',
                keywordBatchModePreviewSummary: summary,
              }
            : j,
        ),
      )
      refreshIfKeywordsList()
    },
    [refreshIfKeywordsList],
  )

  const failKeywordBatchModePreviewJob = useCallback(
    ({ jobId, message }: { jobId: string; message: string }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'keyword-batch-mode-preview-sync'
            ? {
                ...j,
                phase: 'failed',
                errorMessage: message,
              }
            : j,
        ),
      )
      refreshIfKeywordsList()
    },
    [refreshIfKeywordsList],
  )

  const startContentBriefDraftSkeletonPreviewJob = useCallback(
    ({ siteLabel }: { siteLabel?: string } = {}): string => {
      const id = newId()
      const job: BackgroundActivityJob = {
        id,
        kind: 'content-brief-draft-skeleton-preview-sync',
        phase: 'running',
        ...(siteLabel?.trim() ? { siteLabel: siteLabel.trim() } : {}),
        startedAt: Date.now(),
      }
      setJobs((prev) => [...prev, job])
      refreshIfWorkflowJobsList()
      refreshIfContentBriefsList()
      return id
    },
    [refreshIfContentBriefsList, refreshIfWorkflowJobsList],
  )

  const completeContentBriefDraftSkeletonPreviewJob = useCallback(
    ({
      jobId,
      summary,
    }: {
      jobId: string
      summary: NonNullable<BackgroundActivityJob['contentBriefDraftSkeletonPreviewSummary']>
    }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId &&
          j.phase === 'running' &&
          j.kind === 'content-brief-draft-skeleton-preview-sync'
            ? {
                ...j,
                phase: 'succeeded',
                contentBriefDraftSkeletonPreviewSummary: summary,
              }
            : j,
        ),
      )
      refreshIfWorkflowJobsList()
      refreshIfContentBriefsList()
    },
    [refreshIfContentBriefsList, refreshIfWorkflowJobsList],
  )

  const failContentBriefDraftSkeletonPreviewJob = useCallback(
    ({ jobId, message }: { jobId: string; message: string }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId &&
          j.phase === 'running' &&
          j.kind === 'content-brief-draft-skeleton-preview-sync'
            ? {
                ...j,
                phase: 'failed',
                errorMessage: message,
              }
            : j,
        ),
      )
      refreshIfWorkflowJobsList()
      refreshIfContentBriefsList()
    },
    [refreshIfContentBriefsList, refreshIfWorkflowJobsList],
  )

  const startBatchEnqueueJob = useCallback(
    ({ siteLabel }: { siteLabel?: string } = {}): string => {
      const id = newId()
      const job: BackgroundActivityJob = {
        id,
        kind: 'batch-enqueue-sync',
        phase: 'running',
        ...(siteLabel?.trim() ? { siteLabel: siteLabel.trim() } : {}),
        startedAt: Date.now(),
      }
      setJobs((prev) => [...prev, job])
      refreshIfWorkflowJobsList()
      refreshIfContentBriefsList()
      return id
    },
    [refreshIfContentBriefsList, refreshIfWorkflowJobsList],
  )

  const completeBatchEnqueueJob = useCallback(
    ({
      jobId,
      summary,
    }: {
      jobId: string
      summary: NonNullable<BackgroundActivityJob['batchEnqueueSummary']>
    }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'batch-enqueue-sync'
            ? {
                ...j,
                phase: 'succeeded',
                batchEnqueueSummary: summary,
              }
            : j,
        ),
      )
      refreshIfWorkflowJobsList()
      refreshIfContentBriefsList()
    },
    [refreshIfContentBriefsList, refreshIfWorkflowJobsList],
  )

  const failBatchEnqueueJob = useCallback(
    ({ jobId, message }: { jobId: string; message: string }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'batch-enqueue-sync'
            ? {
                ...j,
                phase: 'failed',
                errorMessage: message,
              }
            : j,
        ),
      )
      refreshIfWorkflowJobsList()
      refreshIfContentBriefsList()
    },
    [refreshIfContentBriefsList, refreshIfWorkflowJobsList],
  )

  const startWorkflowJobsPipelineJob = useCallback(
    (args?: { scopeHint?: string }): string => {
      const id = newId()
      const hint = args?.scopeHint?.trim()
      const job: BackgroundActivityJob = {
        id,
        kind: 'workflow-jobs-pipeline-sync',
        phase: 'running',
        ...(hint ? { workflowPipelineScopeHint: hint } : {}),
        startedAt: Date.now(),
      }
      setJobs((prev) => [...prev, job])
      refreshIfWorkflowJobsList()
      return id
    },
    [refreshIfWorkflowJobsList],
  )

  const updateWorkflowJobsPipelineJobProgress = useCallback(
    ({
      jobId,
      batches,
      totalTicks,
      debugLinesAppend,
    }: {
      jobId: string
      batches: number
      totalTicks: number
      debugLinesAppend?: string[]
    }): void => {
      const MAX_PIPELINE_DEBUG_LINES = 30
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'workflow-jobs-pipeline-sync'
            ? {
                ...j,
                workflowJobsPipelineProgress: { batches, totalTicks },
                ...(debugLinesAppend != null && debugLinesAppend.length > 0
                  ? {
                      workflowJobsPipelineDebugLines: [
                        ...(j.workflowJobsPipelineDebugLines ?? []),
                        ...debugLinesAppend,
                      ].slice(-MAX_PIPELINE_DEBUG_LINES),
                    }
                  : {}),
              }
            : j,
        ),
      )
      refreshIfWorkflowJobsList()
    },
    [refreshIfWorkflowJobsList],
  )

  const completeWorkflowJobsPipelineJob = useCallback(
    ({ jobId, summary }: { jobId: string; summary: WorkflowJobsPipelineSummary }): void => {
      setJobs((prev) =>
        prev.map((j) => {
          if (j.id !== jobId || j.phase !== 'running' || j.kind !== 'workflow-jobs-pipeline-sync') {
            return j
          }
          const hintLines = j.workflowJobsPipelineDebugLines
          return {
            ...j,
            phase: 'succeeded',
            workflowJobsPipelineSummary: {
              ...summary,
              ...(hintLines != null && hintLines.length > 0
                ? { pipelineBannerHints: [...hintLines] }
                : {}),
            },
            workflowJobsPipelineDebugLines: undefined,
          }
        }),
      )
      refreshIfWorkflowJobsList()
    },
    [refreshIfWorkflowJobsList],
  )

  const failWorkflowJobsPipelineJob = useCallback(
    ({ jobId, message }: { jobId: string; message: string }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'workflow-jobs-pipeline-sync'
            ? {
                ...j,
                phase: 'failed',
                errorMessage: message,
              }
            : j,
        ),
      )
      refreshIfWorkflowJobsList()
    },
    [refreshIfWorkflowJobsList],
  )

  const startSiteRecordSaveJob = useCallback(
    ({ action, siteLabel }: { action: 'create' | 'update'; siteLabel?: string }): string => {
      const id = newId()
      const job: BackgroundActivityJob = {
        id,
        kind: 'site-record-save-sync',
        phase: 'running',
        ...(siteLabel?.trim() ? { siteLabel: siteLabel.trim() } : {}),
        siteRecordSaveSummary: {
          action,
          siteId: 0,
          name: siteLabel?.trim() || '站点记录',
          slug: '',
        },
        startedAt: Date.now(),
      }
      setJobs((prev) => [...prev, job])
      refreshIfSitesList()
      return id
    },
    [refreshIfSitesList],
  )

  const completeSiteRecordSaveJob = useCallback(
    ({
      jobId,
      summary,
    }: {
      jobId: string
      summary: NonNullable<BackgroundActivityJob['siteRecordSaveSummary']>
    }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'site-record-save-sync'
            ? {
                ...j,
                phase: 'succeeded',
                siteRecordSaveSummary: summary,
              }
            : j,
        ),
      )
      refreshIfSitesList()
    },
    [refreshIfSitesList],
  )

  const failSiteRecordSaveJob = useCallback(
    ({ jobId, message }: { jobId: string; message: string }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'site-record-save-sync'
            ? {
                ...j,
                phase: 'failed',
                errorMessage: message,
              }
            : j,
        ),
      )
      refreshIfSitesList()
    },
    [refreshIfSitesList],
  )

  const startContentManagementActionJob = useCallback(
    ({
      label,
      siteId,
      siteLabel,
      targetCollection,
    }: {
      label: string
      siteId?: number
      siteLabel?: string
      targetCollection?: NonNullable<
        BackgroundActivityJob['contentManagementActionSummary']
      >['targetCollection']
    }): string => {
      const id = newId()
      const labelTrim = label.trim() || '内容管理操作'
      const siteLabelTrim = siteLabel?.trim()
      const job: BackgroundActivityJob = {
        id,
        kind: 'content-management-action-sync',
        phase: 'running',
        ...(siteLabelTrim ? { siteLabel: siteLabelTrim } : {}),
        contentManagementActionSummary: {
          label: labelTrim,
          ...(typeof siteId === 'number' && Number.isFinite(siteId) ? { siteId } : {}),
          ...(siteLabelTrim ? { siteLabel: siteLabelTrim } : {}),
          ...(targetCollection ? { targetCollection } : {}),
        },
        startedAt: Date.now(),
      }
      setJobs((prev) => [...prev, job])
      refreshIfContentManagementTargetList()
      return id
    },
    [refreshIfContentManagementTargetList],
  )

  const updateContentManagementActionJobProgress = useCallback(
    ({ jobId, detail }: { jobId: string; detail?: string }): void => {
      const detailText = detail?.trim()
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'content-management-action-sync'
            ? {
                ...j,
                contentManagementActionSummary: {
                  label: j.contentManagementActionSummary?.label ?? '内容管理操作',
                  ...(typeof j.contentManagementActionSummary?.siteId === 'number' &&
                  Number.isFinite(j.contentManagementActionSummary.siteId)
                    ? { siteId: j.contentManagementActionSummary.siteId }
                    : {}),
                  ...(j.contentManagementActionSummary?.siteLabel
                    ? { siteLabel: j.contentManagementActionSummary.siteLabel }
                    : {}),
                  ...(detailText ? { detail: detailText } : {}),
                  ...(j.contentManagementActionSummary?.targetCollection
                    ? { targetCollection: j.contentManagementActionSummary.targetCollection }
                    : {}),
                },
              }
            : j,
        ),
      )
    },
    [],
  )

  const completeContentManagementActionJob = useCallback(
    ({
      jobId,
      detail,
      targetCollection,
    }: {
      jobId: string
      detail?: string
      targetCollection?: NonNullable<
        BackgroundActivityJob['contentManagementActionSummary']
      >['targetCollection']
    }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'content-management-action-sync'
            ? {
                ...j,
                phase: 'succeeded',
                contentManagementActionSummary: {
                  label: j.contentManagementActionSummary?.label ?? '内容管理操作',
                  ...(typeof j.contentManagementActionSummary?.siteId === 'number' &&
                  Number.isFinite(j.contentManagementActionSummary.siteId)
                    ? { siteId: j.contentManagementActionSummary.siteId }
                    : {}),
                  ...(j.contentManagementActionSummary?.siteLabel
                    ? { siteLabel: j.contentManagementActionSummary.siteLabel }
                    : {}),
                  ...(detail?.trim() ? { detail: detail.trim() } : {}),
                  ...((targetCollection ?? j.contentManagementActionSummary?.targetCollection)
                    ? {
                        targetCollection:
                          targetCollection ?? j.contentManagementActionSummary?.targetCollection,
                      }
                    : {}),
                },
              }
            : j,
        ),
      )
      refreshIfContentManagementTargetList()
    },
    [refreshIfContentManagementTargetList],
  )

  const failContentManagementActionJob = useCallback(
    ({ jobId, message }: { jobId: string; message: string }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'content-management-action-sync'
            ? {
                ...j,
                phase: 'failed',
                errorMessage: message,
              }
            : j,
        ),
      )
      refreshIfContentManagementTargetList()
    },
    [refreshIfContentManagementTargetList],
  )

  const value = useMemo<AdminBackgroundActivityApi>(
    () => ({
      jobs,
      startCategoryCoverJob,
      completeCategoryCoverJob,
      failCategoryCoverJob,
      startCategorySlotsJob,
      completeCategorySlotsJob,
      failCategorySlotsJob,
      startMerchantSlotDispatchJob,
      completeMerchantSlotDispatchJob,
      failMerchantSlotDispatchJob,
      startTrustPagesBundleJob,
      completeTrustPagesBundleJob,
      failTrustPagesBundleJob,
      startKeywordsDfsFetchJob,
      completeKeywordsDfsFetchJob,
      failKeywordsDfsFetchJob,
      startKeywordQuickWinPreviewJob,
      completeKeywordQuickWinPreviewJob,
      failKeywordQuickWinPreviewJob,
      startKeywordBatchModePreviewJob,
      completeKeywordBatchModePreviewJob,
      failKeywordBatchModePreviewJob,
      startContentBriefDraftSkeletonPreviewJob,
      completeContentBriefDraftSkeletonPreviewJob,
      failContentBriefDraftSkeletonPreviewJob,
      startBatchEnqueueJob,
      completeBatchEnqueueJob,
      failBatchEnqueueJob,
      startWorkflowJobsPipelineJob,
      updateWorkflowJobsPipelineJobProgress,
      completeWorkflowJobsPipelineJob,
      failWorkflowJobsPipelineJob,
      startSiteRecordSaveJob,
      completeSiteRecordSaveJob,
      failSiteRecordSaveJob,
      startContentManagementActionJob,
      updateContentManagementActionJobProgress,
      completeContentManagementActionJob,
      failContentManagementActionJob,
      dismissJob,
    }),
    [
      jobs,
      startCategoryCoverJob,
      completeCategoryCoverJob,
      failCategoryCoverJob,
      startCategorySlotsJob,
      completeCategorySlotsJob,
      failCategorySlotsJob,
      startMerchantSlotDispatchJob,
      completeMerchantSlotDispatchJob,
      failMerchantSlotDispatchJob,
      startTrustPagesBundleJob,
      completeTrustPagesBundleJob,
      failTrustPagesBundleJob,
      startKeywordsDfsFetchJob,
      completeKeywordsDfsFetchJob,
      failKeywordsDfsFetchJob,
      startKeywordQuickWinPreviewJob,
      completeKeywordQuickWinPreviewJob,
      failKeywordQuickWinPreviewJob,
      startKeywordBatchModePreviewJob,
      completeKeywordBatchModePreviewJob,
      failKeywordBatchModePreviewJob,
      startContentBriefDraftSkeletonPreviewJob,
      completeContentBriefDraftSkeletonPreviewJob,
      failContentBriefDraftSkeletonPreviewJob,
      startBatchEnqueueJob,
      completeBatchEnqueueJob,
      failBatchEnqueueJob,
      startWorkflowJobsPipelineJob,
      updateWorkflowJobsPipelineJobProgress,
      completeWorkflowJobsPipelineJob,
      failWorkflowJobsPipelineJob,
      startSiteRecordSaveJob,
      completeSiteRecordSaveJob,
      failSiteRecordSaveJob,
      startContentManagementActionJob,
      updateContentManagementActionJobProgress,
      completeContentManagementActionJob,
      failContentManagementActionJob,
      dismissJob,
    ],
  )

  return (
    <AdminBackgroundActivityReactContext.Provider value={value}>
      <AdminBackgroundActivityBanner />
      {children}
    </AdminBackgroundActivityReactContext.Provider>
  )
}
