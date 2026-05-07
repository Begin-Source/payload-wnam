'use client'

import {
  AdminBackgroundActivityReactContext,
  type AdminBackgroundActivityApi,
  type BackgroundActivityJob,
  type CategoryCoverSyncRowResult,
  type CategorySlotsSyncRowResult,
  type MerchantSlotDispatchRowResult,
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
    if (
      typeof window !== 'undefined' &&
      pathname.includes('/collections/categories')
    ) {
      router.refresh()
    }
  }, [pathname, router])

  const refreshIfCategoriesOrOffersList = useCallback((): void => {
    if (typeof window === 'undefined') return
    if (
      pathname.includes('/collections/categories') ||
      pathname.includes('/collections/offers')
    ) {
      router.refresh()
    }
  }, [pathname, router])

  const refreshIfPagesList = useCallback((): void => {
    if (
      typeof window !== 'undefined' &&
      pathname.includes('/collections/pages')
    ) {
      router.refresh()
    }
  }, [pathname, router])

  const refreshIfKeywordsList = useCallback((): void => {
    if (
      typeof window !== 'undefined' &&
      pathname.includes('/collections/keywords')
    ) {
      router.refresh()
    }
  }, [pathname, router])

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

  const hasRunningListPollWork =
    hasRunningCategoriesListWork ||
    hasRunningTrustPagesBundleWork ||
    hasRunningKeywordsDfsFetchWork ||
    hasRunningKeywordQuickWinPreviewWork

  useEffect(() => {
    if (!hasRunningListPollWork) return

    const interval = window.setInterval(() => {
      refreshIfCategoriesList()
      refreshIfPagesList()
      refreshIfKeywordsList()
    }, POLL_MS)
    let capMs = POLL_CAP_MS
    if (hasRunningMerchantCategoriesWork) capMs = Math.max(capMs, POLL_CAP_MS_MERCHANT)
    if (hasRunningTrustPagesBundleWork) capMs = Math.max(capMs, POLL_CAP_MS_TRUST_PAGES_BUNDLE)
    if (hasRunningKeywordsDfsFetchWork || hasRunningKeywordQuickWinPreviewWork) {
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
    refreshIfCategoriesList,
    refreshIfPagesList,
    refreshIfKeywordsList,
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
                ...(Array.isArray(results) && results.length > 0 ? { slotsSyncResults: results } : {}),
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
    ({
      jobId,
      slugs,
      locale,
    }: {
      jobId: string
      slugs?: string[]
      locale?: string
    }): void => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId && j.phase === 'running' && j.kind === 'trust-pages-bundle-sync'
            ? {
                ...j,
                phase: 'succeeded',
                okCount: 1,
                failCount: 0,
                ...(locale?.trim() ? { trustPagesBundleLocale: locale.trim() } : {}),
                ...(Array.isArray(slugs) && slugs.length > 0 ? { trustPagesBundleSlugs: slugs } : {}),
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
