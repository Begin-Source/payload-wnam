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

  useEffect(() => {
    if (!hasRunningCategoriesListWork) return

    const interval = window.setInterval(() => {
      refreshIfCategoriesList()
    }, POLL_MS)
    const capMs = hasRunningMerchantCategoriesWork ? POLL_CAP_MS_MERCHANT : POLL_CAP_MS
    const cap = window.setTimeout(() => {
      window.clearInterval(interval)
    }, capMs)

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(cap)
    }
  }, [
    hasRunningCategoriesListWork,
    hasRunningMerchantCategoriesWork,
    refreshIfCategoriesList,
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
