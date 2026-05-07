import { createContext, useContext } from 'react'

import type { CategorySlotsSyncRowResult } from '@/utilities/categorySlotsGeneration/runCategorySlotsForSite'

export type { CategorySlotsSyncRowResult }

export type BackgroundJobKind =
  | 'category-cover-sync'
  | 'category-slots-sync'
  | 'merchant-slot-dispatch-sync'

/** Mirrors `merchant-slot-fetch` payload `results[]` (subset for Banner); writeback fields filled after Webhook poll. */
export type MerchantSlotDispatchRowResult = {
  categoryId: number
  ok: boolean
  skipped?: boolean
  tag?: string
  error?: string
  offersMarkedRunning?: number
  /** 派发跳过或 Webhook 完成后可读一行说明 */
  writebackNote?: string
}

/** Mirrors `generate-cover-sync` payload `results[]` (subset exposed to admin UI). */
export type CategoryCoverSyncRowResult = {
  categoryId: number
  ok: boolean
  name?: string
  slug?: string
  error?: string
  message?: string
  mediaId?: number
  mode?: string
}

export type BackgroundActivityJob = {
  id: string
  kind: BackgroundJobKind
  phase: 'running' | 'succeeded' | 'failed'
  startedAt: number
  /** Together 分类封面批次 */
  categoryCount?: number
  /** 分类槽位：可选展示用 */
  siteLabel?: string
  okCount?: number
  failCount?: number
  errorMessage?: string
  /** Together 封面同步：`generate-cover-sync` 的逐条 results */
  coverSyncResults?: CategoryCoverSyncRowResult[]
  /** 分类槽位：`generate-slots` 成功后的槽位 1–5 读回快照 */
  slotsSyncResults?: CategorySlotsSyncRowResult[]
  /** DataForSEO 拉品派发：`merchant-slot-fetch` 的逐条 results */
  merchantSlotDispatchResults?: MerchantSlotDispatchRowResult[]
  /** 派发批次 ID（成功时） */
  batchId?: string
}

export type AdminBackgroundActivityApi = {
  jobs: BackgroundActivityJob[]
  startCategoryCoverJob: (args: { categoryCount: number }) => string
  completeCategoryCoverJob: (args: {
    jobId: string
    okCount: number
    failCount: number
    results?: CategoryCoverSyncRowResult[]
  }) => void
  failCategoryCoverJob: (args: { jobId: string; message: string }) => void
  startCategorySlotsJob: (args: { siteLabel?: string }) => string
  completeCategorySlotsJob: (args: {
    jobId: string
    okCount?: number
    failCount?: number
    results?: CategorySlotsSyncRowResult[]
  }) => void
  failCategorySlotsJob: (args: { jobId: string; message: string }) => void
  startMerchantSlotDispatchJob: (args: { categoryCount: number; siteLabel?: string }) => string
  completeMerchantSlotDispatchJob: (args: {
    jobId: string
    okCount: number
    failCount: number
    batchId?: string
    results?: MerchantSlotDispatchRowResult[]
  }) => void
  failMerchantSlotDispatchJob: (args: { jobId: string; message: string }) => void
  dismissJob: (jobId: string) => void
}

const Ctx = createContext<AdminBackgroundActivityApi | null>(null)

export function useAdminBackgroundActivity(): AdminBackgroundActivityApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAdminBackgroundActivity must be used within AdminBackgroundActivityProvider')
  return v
}

export const AdminBackgroundActivityReactContext = Ctx
