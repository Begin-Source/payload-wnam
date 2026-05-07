'use client'

import { adminCategoriesListPath, adminKeywordsListPath, adminPagesListPath, adminWorkflowJobsListPath } from '@/components/adminBackgroundActivity/categoriesListPath'
import { useAdminBackgroundActivity } from '@/components/adminBackgroundActivity/AdminBackgroundActivityContext'
import type {
  BackgroundActivityJob,
  CategoryCoverSyncRowResult,
  CategorySlotsSyncRowResult,
  MerchantSlotDispatchRowResult,
} from '@/components/adminBackgroundActivity/AdminBackgroundActivityContext'
import { WORKFLOW_STATUS_STYLES } from '@/components/workflowStatusBadge'
import { usePathname, useRouter } from 'next/navigation'
import React, { useState } from 'react'

const BANNER_Z = 9990

const LIST_BANNER_KINDS = [
  'category-cover-sync',
  'category-slots-sync',
  'merchant-slot-dispatch-sync',
  'trust-pages-bundle-sync',
  'keywords-dfs-fetch-sync',
  'keyword-quick-win-preview-sync',
  'workflow-jobs-pipeline-sync',
] as const

function inListBannerScope(j: BackgroundActivityJob): boolean {
  return (LIST_BANNER_KINDS as readonly string[]).includes(j.kind)
}

const COVER_DETAIL_LINE_MAX = 160
const COVER_SUCCESS_PREVIEW = 3

const SLOTS_DETAIL_LINE_MAX = COVER_DETAIL_LINE_MAX
const SLOTS_SUCCESS_PREVIEW = COVER_SUCCESS_PREVIEW

const MERCHANT_DETAIL_LINE_MAX = COVER_DETAIL_LINE_MAX
const MERCHANT_SUCCESS_PREVIEW = COVER_SUCCESS_PREVIEW

function formatMerchantDispatchShortLabel(row: MerchantSlotDispatchRowResult): string {
  const head = `#${row.categoryId}`
  if (!row.ok) return `${head} — ${(row.error || '失败').trim()}`
  if (row.skipped) {
    const note = row.writebackNote?.trim()
    return note ? `${head} · 已跳过派发 · ${note}` : `${head} · 已跳过派发`
  }
  const parts = [head]
  if (row.tag?.trim()) parts.push(`tag ${row.tag.trim()}`)
  if (typeof row.offersMarkedRunning === 'number') parts.push(`槽位标记 +${row.offersMarkedRunning}`)
  const note = row.writebackNote?.trim()
  if (note) parts.push(note)
  return parts.join(' · ')
}

function buildMerchantDispatchDetailBlocks(rows: MerchantSlotDispatchRowResult[]): {
  text: string
  titleHover: string
} {
  const fails = rows.filter((r) => !r.ok)
  const oks = rows.filter((r) => r.ok)
  const chunks: string[] = []
  const hover: string[] = []

  if (oks.length > 0) {
    if (oks.length <= MERCHANT_SUCCESS_PREVIEW) {
      chunks.push(`Offer 写入成功（${oks.length} 个）：${oks.map(formatMerchantDispatchShortLabel).join('；')}`)
    } else {
      const preview = oks
        .slice(0, MERCHANT_SUCCESS_PREVIEW)
        .map(formatMerchantDispatchShortLabel)
        .join('；')
      chunks.push(`Offer 写入成功（${oks.length} 个）：${preview} …`)
    }
    for (const r of oks) {
      const extras = [
        r.skipped ? 'skipped' : '',
        r.tag?.trim() ? `tag ${r.tag.trim()}` : '',
        typeof r.offersMarkedRunning === 'number' ? `offers +${r.offersMarkedRunning}` : '',
        r.writebackNote?.trim() ? r.writebackNote.trim() : '',
      ]
        .filter(Boolean)
        .join(', ')
      hover.push(`${formatMerchantDispatchShortLabel(r)}${extras ? ` — ${extras}` : ''}`)
    }
  }

  if (fails.length > 0) {
    chunks.push(
      ['失败明细：']
        .concat(
          fails.map((r) => {
            const label = formatMerchantDispatchShortLabel(r)
            const rawReason = (r.error || '未知原因').trim()
            hover.push(`${label} — ${rawReason}`)
            return clipText(`· ${label} — ${rawReason}`, MERCHANT_DETAIL_LINE_MAX)
          }),
        )
        .join('\n'),
    )
  }

  return { text: chunks.join('\n\n'), titleHover: hover.join('\n') }
}

function clipText(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function keywordQuickWinPreviewClusterFailed(notices: string[] | undefined): boolean {
  return (notices ?? []).some((n) => n.includes('SERP 聚类失败'))
}

function formatCoverRowShortLabel(row: CategoryCoverSyncRowResult): string {
  const name = row.name?.trim()
  const slug = row.slug?.trim()
  const idPrefix = `#${row.categoryId}`
  if (name && slug) return `${idPrefix} ${name} (${slug})`
  if (name) return `${idPrefix} ${name}`
  if (slug) return `${idPrefix} ${slug}`
  return idPrefix
}

function buildCoverSyncDetailBlocks(rows: CategoryCoverSyncRowResult[]): {
  text: string
  titleHover: string
} {
  const fails = rows.filter((r) => !r.ok)
  const oks = rows.filter((r) => r.ok)
  const chunks: string[] = []
  const hover: string[] = []

  if (oks.length > 0) {
    if (oks.length <= COVER_SUCCESS_PREVIEW) {
      chunks.push(`成功（${oks.length} 条）：${oks.map(formatCoverRowShortLabel).join('；')}`)
    } else {
      const preview = oks.slice(0, COVER_SUCCESS_PREVIEW).map(formatCoverRowShortLabel).join('；')
      chunks.push(`成功（${oks.length} 条）：${preview} …`)
    }
    for (const r of oks) {
      const extras = [r.mode ? `mode ${r.mode}` : '', r.mediaId != null ? `media ${r.mediaId}` : '']
        .filter(Boolean)
        .join(', ')
      hover.push(`${formatCoverRowShortLabel(r)}${extras ? ` — ${extras}` : ''}`)
    }
  }

  if (fails.length > 0) {
    chunks.push(
      ['失败明细：']
        .concat(
          fails.map((r) => {
            const label = formatCoverRowShortLabel(r)
            const rawReason = (r.message || r.error || '未知原因').trim()
            hover.push(`${label} — ${rawReason}`)
            return clipText(`· ${label} — ${rawReason}`, COVER_DETAIL_LINE_MAX)
          }),
        )
        .join('\n'),
    )
  }

  return { text: chunks.join('\n\n'), titleHover: hover.join('\n') }
}

function formatSlotsRowShortLabel(row: CategorySlotsSyncRowResult): string {
  const name = row.name?.trim()
  const slug = row.slug?.trim()
  if (!row.ok) {
    const head = `#槽位${row.slotIndex}`
    const reason = (row.message || row.error || '未知原因').trim()
    return `${head} — ${reason}`
  }
  if (typeof row.categoryId === 'number' && Number.isFinite(row.categoryId)) {
    const idPrefix = `#${row.categoryId}`
    if (name && slug) return `${idPrefix} ${name} (${slug})`
    if (name) return `${idPrefix} ${name}`
    if (slug) return `${idPrefix} ${slug}`
    return `${idPrefix}（槽位 ${row.slotIndex}）`
  }
  const head = `#槽位${row.slotIndex}`
  if (name && slug) return `${head} ${name} (${slug})`
  if (name) return `${head} ${name}`
  if (slug) return `${head} ${slug}`
  return head
}

function buildSlotsSyncDetailBlocks(rows: CategorySlotsSyncRowResult[]): {
  text: string
  titleHover: string
} {
  const fails = rows.filter((r) => !r.ok)
  const oks = rows.filter((r) => r.ok)
  const chunks: string[] = []
  const hover: string[] = []

  if (oks.length > 0) {
    if (oks.length <= SLOTS_SUCCESS_PREVIEW) {
      chunks.push(`成功（${oks.length} 槽）：${oks.map(formatSlotsRowShortLabel).join('；')}`)
    } else {
      const preview = oks
        .slice(0, SLOTS_SUCCESS_PREVIEW)
        .map(formatSlotsRowShortLabel)
        .join('；')
      chunks.push(`成功（${oks.length} 槽）：${preview} …`)
    }
    for (const r of oks) {
      const extras = [`槽位 ${r.slotIndex}`, r.categoryId != null ? `id ${r.categoryId}` : '']
        .filter(Boolean)
        .join(', ')
      hover.push(`${formatSlotsRowShortLabel(r)}${extras ? ` — ${extras}` : ''}`)
    }
  }

  if (fails.length > 0) {
    chunks.push(
      ['失败明细：']
        .concat(
          fails.map((r) => {
            const label = formatSlotsRowShortLabel(r)
            const rawReason = (r.message || r.error || '未知原因').trim()
            hover.push(`${label} — ${rawReason}`)
            return clipText(`· ${label} — ${rawReason}`, SLOTS_DETAIL_LINE_MAX)
          }),
        )
        .join('\n'),
    )
  }

  return { text: chunks.join('\n\n'), titleHover: hover.join('\n') }
}

export function AdminBackgroundActivityBanner(): React.ReactElement | null {
  const pathname = usePathname()
  const router = useRouter()
  const { jobs, dismissJob } = useAdminBackgroundActivity()

  const [qwBriefEnqueueBusyId, setQwBriefEnqueueBusyId] = useState<string | null>(null)
  const [qwBriefEnqueueError, setQwBriefEnqueueError] = useState<{ id: string; text: string } | null>(
    null,
  )

  const scoped = jobs.filter(inListBannerScope)

  const running = scoped.filter((j) => j.phase === 'running')
  const runningCover = running.filter((j) => j.kind === 'category-cover-sync')
  const runningSlots = running.filter((j) => j.kind === 'category-slots-sync')
  const runningMerchant = running.filter((j) => j.kind === 'merchant-slot-dispatch-sync')
  const runningTrustBundle = running.filter((j) => j.kind === 'trust-pages-bundle-sync')
  const runningKeywordsDfsFetch = running.filter((j) => j.kind === 'keywords-dfs-fetch-sync')
  const runningKeywordQuickWinPreview = running.filter(
    (j) => j.kind === 'keyword-quick-win-preview-sync',
  )
  const runningWorkflowJobsPipeline = running.filter((j) => j.kind === 'workflow-jobs-pipeline-sync')

  const terminal = scoped.filter((j) => j.phase !== 'running')
  const latestTerminal =
    terminal.length === 0
      ? null
      : terminal.reduce((a, b) => (a.startedAt >= b.startedAt ? a : b))

  type Primary =
    | { tag: 'running-cover'; batches: BackgroundActivityJob[] }
    | { tag: 'running-slots'; batches: BackgroundActivityJob[] }
    | { tag: 'running-merchant'; batches: BackgroundActivityJob[] }
    | { tag: 'running-trust-bundle'; batches: BackgroundActivityJob[] }
    | { tag: 'running-keywords-dfs'; batches: BackgroundActivityJob[] }
    | { tag: 'running-keywords-quick-win-preview'; batches: BackgroundActivityJob[] }
    | { tag: 'running-workflow-jobs-pipeline'; batches: BackgroundActivityJob[] }
    | { tag: 'terminal'; job: BackgroundActivityJob }
    | null

  let primary: Primary = null
  if (runningCover.length > 0) {
    primary = { tag: 'running-cover', batches: runningCover }
  } else if (runningSlots.length > 0) {
    primary = { tag: 'running-slots', batches: runningSlots }
  } else if (runningMerchant.length > 0) {
    primary = { tag: 'running-merchant', batches: runningMerchant }
  } else if (runningTrustBundle.length > 0) {
    primary = { tag: 'running-trust-bundle', batches: runningTrustBundle }
  } else if (runningKeywordsDfsFetch.length > 0) {
    primary = { tag: 'running-keywords-dfs', batches: runningKeywordsDfsFetch }
  } else if (runningKeywordQuickWinPreview.length > 0) {
    primary = { tag: 'running-keywords-quick-win-preview', batches: runningKeywordQuickWinPreview }
  } else if (runningWorkflowJobsPipeline.length > 0) {
    primary = { tag: 'running-workflow-jobs-pipeline', batches: runningWorkflowJobsPipeline }
  } else if (latestTerminal !== null) {
    primary = { tag: 'terminal', job: latestTerminal }
  }

  if (primary === null) return null

  const categoriesHref = adminCategoriesListPath(pathname ?? '')
  const pagesHref = adminPagesListPath(pathname ?? '')
  const keywordsHref = adminKeywordsListPath(pathname ?? '')
  const workflowJobsHref = adminWorkflowJobsListPath(pathname ?? '')
  const onOpenCategoriesList = (): void => {
    router.push(categoriesHref)
  }
  const onOpenPagesList = (): void => {
    router.push(pagesHref)
  }
  const onOpenKeywordsList = (): void => {
    router.push(keywordsHref)
  }
  const onOpenWorkflowJobsList = (): void => {
    router.push(workflowJobsHref)
  }

  const baseBar: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: BANNER_Z,
    padding: '8px 12px',
    fontSize: '13px',
    lineHeight: 1.45,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  }

  const badgeStyleForBar = (
    key: keyof typeof WORKFLOW_STATUS_STYLES,
  ): Pick<React.CSSProperties, 'background' | 'color' | 'borderBottom'> => {
    const b = WORKFLOW_STATUS_STYLES[key]
    return {
      background: b.background,
      color: b.color,
      borderBottom: b.border,
    }
  }

  const openCategoriesListBtn = (
    <button
      style={{
        padding: '4px 10px',
        borderRadius: 4,
        border: '1px solid var(--theme-elevation-150)',
        background: 'var(--theme-elevation-0)',
        cursor: 'pointer',
        fontSize: '12px',
      }}
      type="button"
      onClick={onOpenCategoriesList}
    >
      打开分类列表
    </button>
  )

  const openPagesListBtn = (
    <button
      style={{
        padding: '4px 10px',
        borderRadius: 4,
        border: '1px solid var(--theme-elevation-150)',
        background: 'var(--theme-elevation-0)',
        cursor: 'pointer',
        fontSize: '12px',
      }}
      type="button"
      onClick={onOpenPagesList}
    >
      打开页面列表
    </button>
  )

  const openKeywordsListBtn = (
    <button
      style={{
        padding: '4px 10px',
        borderRadius: 4,
        border: '1px solid var(--theme-elevation-150)',
        background: 'var(--theme-elevation-0)',
        cursor: 'pointer',
        fontSize: '12px',
      }}
      type="button"
      onClick={onOpenKeywordsList}
    >
      打开关键词列表
    </button>
  )

  const openWorkflowJobsListBtn = (
    <button
      style={{
        padding: '4px 10px',
        borderRadius: 4,
        border: '1px solid var(--theme-elevation-150)',
        background: 'var(--theme-elevation-0)',
        cursor: 'pointer',
        fontSize: '12px',
      }}
      type="button"
      onClick={onOpenWorkflowJobsList}
    >
      打开工作流任务列表
    </button>
  )

  const closeIconBtnStyle: React.CSSProperties = {
    padding: '4px 8px',
    borderRadius: 4,
    border: 'none',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: '18px',
    lineHeight: 1,
  }

  const dismissRunningBatches = (batches: BackgroundActivityJob[]): void => {
    for (const j of batches) dismissJob(j.id)
  }

  if (primary.tag === 'running-cover') {
    const totalBatches = primary.batches.length
    const totalCategories = primary.batches.reduce((n, j) => n + (j.categoryCount ?? 0), 0)
    const line =
      totalBatches === 1
        ? `Together 分类封面进行中（${totalCategories} 条）— 进度见分类列表「Together 封面」列`
        : `Together 分类封面进行中（${totalBatches} 批，共 ${totalCategories} 条）— 进度见分类列表「Together 封面」列`

    return (
      <div
        aria-live="polite"
        role="status"
        style={{
          ...baseBar,
          ...badgeStyleForBar('running'),
        }}
      >
        <span style={{ flex: '1 1 12rem' }}>{line}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {openCategoriesListBtn}
          <button
            aria-label="关闭横幅（后台任务继续进行）"
            style={closeIconBtnStyle}
            type="button"
            onClick={() => dismissRunningBatches(primary.batches)}
          >
            ×
          </button>
        </span>
      </div>
    )
  }

  if (primary.tag === 'running-slots') {
    const n = primary.batches.length
    const siteHint =
      n === 1 && primary.batches[0]?.siteLabel
        ? `（站点：${primary.batches[0].siteLabel}）`
        : ''
    const line =
      n === 1
        ? `快捷操作 · 分类槽位生成进行中${siteHint} — 请在分类列表「分类槽位流程状态」列查看进度`
        : `快捷操作 · 分类槽位生成进行中（${n} 个站点）— 请在分类列表「分类槽位流程状态」列查看进度`

    return (
      <div
        aria-live="polite"
        role="status"
        style={{
          ...baseBar,
          ...badgeStyleForBar('running'),
        }}
      >
        <span style={{ flex: '1 1 12rem' }}>{line}</span>
        <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
          {openCategoriesListBtn}
          <button
            aria-label="关闭横幅（后台任务继续进行）"
            style={closeIconBtnStyle}
            type="button"
            onClick={() => dismissRunningBatches(primary.batches)}
          >
            ×
          </button>
        </span>
      </div>
    )
  }

  if (primary.tag === 'running-merchant') {
    const n = primary.batches.length
    const totalCats = primary.batches.reduce((acc, j) => acc + (j.categoryCount ?? 0), 0)
    const siteHint =
      n === 1 && primary.batches[0]?.siteLabel
        ? `（站点：${primary.batches[0].siteLabel}）`
        : ''
    const line =
      n === 1
        ? `DataForSEO 分类槽位拉品进行中${siteHint}（${totalCats} 个类目）— 已提交 DFS，正在等待 Webhook 将结果写入 Offer；列表见「Merchant 拉品」「槽位拉取」列`
        : `DataForSEO 分类槽位拉品进行中（${n} 批，共 ${totalCats} 个类目）— 等待 Webhook 写入 Offer；见「Merchant 拉品」列`

    return (
      <div
        aria-live="polite"
        role="status"
        style={{
          ...baseBar,
          ...badgeStyleForBar('running'),
        }}
      >
        <span style={{ flex: '1 1 12rem' }}>{line}</span>
        <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
          {openCategoriesListBtn}
          <button
            aria-label="关闭横幅（后台任务继续进行）"
            style={closeIconBtnStyle}
            type="button"
            onClick={() => dismissRunningBatches(primary.batches)}
          >
            ×
          </button>
        </span>
      </div>
    )
  }

  if (primary.tag === 'running-trust-bundle') {
    const n = primary.batches.length
    const siteHint =
      n === 1 && primary.batches[0]?.siteLabel
        ? `（站点：${primary.batches[0].siteLabel}）`
        : ''
    const line =
      n === 1
        ? `快捷操作 · 信任页包（en）生成进行中${siteHint} — OpenRouter 写回五页正文；请在页面列表「信任页包流程」列查看进度`
        : `快捷操作 · 信任页包（en）生成进行中（${n} 个站点）— 见页面列表「信任页包流程」列`

    return (
      <div
        aria-live="polite"
        role="status"
        style={{
          ...baseBar,
          ...badgeStyleForBar('running'),
        }}
      >
        <span style={{ flex: '1 1 12rem' }}>{line}</span>
        <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
          {openPagesListBtn}
          <button
            aria-label="关闭横幅（后台任务继续进行）"
            style={closeIconBtnStyle}
            type="button"
            onClick={() => dismissRunningBatches(primary.batches)}
          >
            ×
          </button>
        </span>
      </div>
    )
  }

  if (primary.tag === 'running-keywords-dfs') {
    const n = primary.batches.length
    const siteHint =
      n === 1 && primary.batches[0]?.siteLabel
        ? `（站点：${primary.batches[0].siteLabel}）`
        : ''
    const line =
      n === 1
        ? `同步拉取 · DataForSEO（关键词）进行中${siteHint} — Labs 建议词拉取并写入草稿；请在关键词列表查看最新行`
        : `同步拉取 · DataForSEO（关键词）进行中（${n} 批）— 写入 keywords（draft）；见关键词列表`

    return (
      <div
        aria-live="polite"
        role="status"
        style={{
          ...baseBar,
          ...badgeStyleForBar('running'),
        }}
      >
        <span style={{ flex: '1 1 12rem' }}>{line}</span>
        <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
          {openKeywordsListBtn}
          <button
            aria-label="关闭横幅（后台任务继续进行）"
            style={closeIconBtnStyle}
            type="button"
            onClick={() => dismissRunningBatches(primary.batches)}
          >
            ×
          </button>
        </span>
      </div>
    )
  }

  if (primary.tag === 'running-keywords-quick-win-preview') {
    const n = primary.batches.length
    const siteHint =
      n === 1 && primary.batches[0]?.siteLabel
        ? `（站点：${primary.batches[0].siteLabel}）`
        : ''
    const line =
      n === 1
        ? `精选 Quick-win → Brief 预览候选进行中${siteHint} — SERP 聚类 + dryRun batch-enqueue；结果见顶栏摘要，关键词列表可刷新 pillar 写入`
        : `精选 Quick-win → Brief 预览候选进行中（${n} 批）— batch-enqueue dryRun`

    return (
      <div
        aria-live="polite"
        role="status"
        style={{
          ...baseBar,
          ...badgeStyleForBar('running'),
        }}
      >
        <span style={{ flex: '1 1 12rem' }}>{line}</span>
        <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
          {openKeywordsListBtn}
          <button
            aria-label="关闭横幅（后台任务继续进行）"
            style={closeIconBtnStyle}
            type="button"
            onClick={() => dismissRunningBatches(primary.batches)}
          >
            ×
          </button>
        </span>
      </div>
    )
  }

  if (primary.tag === 'running-workflow-jobs-pipeline') {
    const n = primary.batches.length
    const j0 = primary.batches[0]
    const scope = j0?.workflowPipelineScopeHint?.trim()
    const scopeHint = scope ? `（${scope}）` : ''
    const prog = j0?.workflowJobsPipelineProgress
    const progLine =
      prog != null && (prog.batches > 0 || prog.totalTicks > 0)
        ? `进度：${prog.batches} 批 · 累计 ${prog.totalTicks} 次 tick — `
        : ''
    const line =
      n === 1
        ? `工作流 · Pipeline（run-next / tick）进行中${scopeHint} — ${progLine}请在「工作流任务」列表查看 Status`
        : `工作流 · Pipeline 进行中（${n} 个并行任务）${scopeHint} — ${progLine}见工作流任务列表`

    return (
      <div
        aria-live="polite"
        role="status"
        style={{
          ...baseBar,
          ...badgeStyleForBar('running'),
        }}
      >
        <span style={{ flex: '1 1 12rem' }}>{line}</span>
        <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
          {openWorkflowJobsListBtn}
          <button
            aria-label="关闭横幅（后台任务继续进行）"
            style={closeIconBtnStyle}
            type="button"
            onClick={() => dismissRunningBatches(primary.batches)}
          >
            ×
          </button>
        </span>
      </div>
    )
  }

  const { job } = primary

  if (job.kind === 'category-slots-sync') {
    const isFailedPhase = job.phase === 'failed'
    if (isFailedPhase) {
      const msg = `分类槽位生成失败：${job.errorMessage ?? '未知错误'}`
      return (
        <div
          aria-live="assertive"
          role="alert"
          style={{
            ...baseBar,
            ...badgeStyleForBar('error'),
          }}
        >
          <span style={{ flex: '1 1 12rem' }}>{msg}</span>
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
            {openCategoriesListBtn}
            <button
              aria-label="关闭横幅"
              style={closeIconBtnStyle}
              type="button"
              onClick={() => dismissJob(job.id)}
            >
              ×
            </button>
          </span>
        </div>
      )
    }

    if (job.phase !== 'succeeded') {
      return null
    }

    const slotRows = job.slotsSyncResults
    const countsOnly =
      typeof job.okCount === 'number' &&
      typeof job.failCount === 'number' &&
      (!Array.isArray(slotRows) || slotRows.length === 0)

    if (countsOnly) {
      const okN = job.okCount ?? 0
      const failN = job.failCount ?? 0
      const isAllSuccess = failN === 0
      const isRedBanner = failN > 0
      const siteBr = job.siteLabel?.trim()
        ? `（${job.siteLabel.trim()}）`
        : ''
      const summaryLine = `分类槽位生成已完成${siteBr}：成功 ${okN} 条，失败 ${failN} 条。`
      return (
        <div
          aria-live={isRedBanner ? 'assertive' : 'polite'}
          role={isRedBanner ? 'alert' : 'status'}
          style={{
            ...baseBar,
            ...badgeStyleForBar(isAllSuccess ? 'done' : 'error'),
          }}
          title={summaryLine}
        >
          <span style={{ flex: '1 1 12rem' }}>{summaryLine}</span>
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
            {openCategoriesListBtn}
            <button
              aria-label="关闭横幅"
              style={closeIconBtnStyle}
              type="button"
              onClick={() => dismissJob(job.id)}
            >
              ×
            </button>
          </span>
        </div>
      )
    }

    if (!Array.isArray(slotRows) || slotRows.length === 0) {
      const msg = `分类槽位生成已完成${job.siteLabel ? `（${job.siteLabel}）` : ''}。请在列表「分类槽位流程状态」列确认。`
      return (
        <div
          aria-live="polite"
          role="status"
          style={{
            ...baseBar,
            ...badgeStyleForBar('done'),
          }}
        >
          <span style={{ flex: '1 1 12rem' }}>{msg}</span>
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
            {openCategoriesListBtn}
            <button
              aria-label="关闭横幅"
              style={closeIconBtnStyle}
              type="button"
              onClick={() => dismissJob(job.id)}
            >
              ×
            </button>
          </span>
        </div>
      )
    }

    const derivedOk = slotRows.filter((r) => r.ok).length
    const derivedFail = slotRows.length - derivedOk
    const okN = typeof job.okCount === 'number' ? job.okCount : derivedOk
    const failN = typeof job.failCount === 'number' ? job.failCount : derivedFail
    const isAllSuccess = failN === 0
    const isRedBanner = failN > 0

    const siteBr = job.siteLabel?.trim()
      ? `（${job.siteLabel.trim()}）`
      : ''
    const summaryLine = `分类槽位生成已完成${siteBr}：成功 ${okN} 条，失败 ${failN} 条。`

    const detail = buildSlotsSyncDetailBlocks(slotRows)
    const titleAttr = clipText(`${summaryLine}\n\n${detail.titleHover}`, 4000)

    return (
      <div
        aria-live={isRedBanner ? 'assertive' : 'polite'}
        role={isRedBanner ? 'alert' : 'status'}
        style={{
          ...baseBar,
          ...badgeStyleForBar(isAllSuccess ? 'done' : 'error'),
        }}
        title={titleAttr}
      >
        <div style={{ flex: '1 1 14rem', minWidth: 0 }}>
          <span style={{ display: 'block' }}>{summaryLine}</span>
          <span
            style={{
              display: 'block',
              marginTop: 6,
              fontSize: '11px',
              lineHeight: 1.45,
              opacity: 0.95,
              whiteSpace: 'pre-line',
              wordBreak: 'break-word',
            }}
          >
            {detail.text}
          </span>
        </div>
        <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
          {openCategoriesListBtn}
          <button
            aria-label="关闭横幅"
            style={closeIconBtnStyle}
            type="button"
            onClick={() => dismissJob(job.id)}
          >
            ×
          </button>
        </span>
      </div>
    )
  }

  if (job.kind === 'merchant-slot-dispatch-sync') {
    if (job.phase === 'failed') {
      const msg = `DataForSEO 分类槽位拉品派发失败：${job.errorMessage ?? '未知错误'}`
      return (
        <div
          aria-live="assertive"
          role="alert"
          style={{
            ...baseBar,
            ...badgeStyleForBar('error'),
          }}
        >
          <span style={{ flex: '1 1 12rem' }}>{msg}</span>
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
            {openCategoriesListBtn}
            <button
              aria-label="关闭横幅"
              style={closeIconBtnStyle}
              type="button"
              onClick={() => dismissJob(job.id)}
            >
              ×
            </button>
          </span>
        </div>
      )
    }

    if (job.phase !== 'succeeded') {
      return null
    }

    const mRows = job.merchantSlotDispatchResults
    const countsOnly =
      typeof job.okCount === 'number' &&
      typeof job.failCount === 'number' &&
      (!Array.isArray(mRows) || mRows.length === 0)

    const siteHint = job.siteLabel?.trim() ? `（${job.siteLabel.trim()}）` : ''
    const batchHint = job.batchId?.trim() ? ` 批次 ${job.batchId.trim()}` : ''

    if (countsOnly) {
      const okN = job.okCount ?? 0
      const failN = job.failCount ?? 0
      const isAllSuccess = failN === 0
      const isRedBanner = failN > 0
      const summaryLine = `DataForSEO 分类槽位拉品已完成（Offer 写入）${siteHint}：成功 ${okN} 个类目，失败 ${failN} 个。${batchHint ? `${batchHint}。` : ''}详情见「Merchant 拉品」「槽位拉取」列。`
      return (
        <div
          aria-live={isRedBanner ? 'assertive' : 'polite'}
          role={isRedBanner ? 'alert' : 'status'}
          style={{
            ...baseBar,
            ...badgeStyleForBar(isAllSuccess ? 'done' : 'error'),
          }}
          title={summaryLine}
        >
          <span style={{ flex: '1 1 12rem' }}>{summaryLine}</span>
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
            {openCategoriesListBtn}
            <button
              aria-label="关闭横幅"
              style={closeIconBtnStyle}
              type="button"
              onClick={() => dismissJob(job.id)}
            >
              ×
            </button>
          </span>
        </div>
      )
    }

    if (!Array.isArray(mRows) || mRows.length === 0) {
      const msg = `DataForSEO 分类槽位拉品已完成（Offer 写入）${siteHint}。请在列表「Merchant 拉品」列确认。${batchHint ? `${batchHint}。` : ''}`
      return (
        <div
          aria-live="polite"
          role="status"
          style={{
            ...baseBar,
            ...badgeStyleForBar('done'),
          }}
        >
          <span style={{ flex: '1 1 12rem' }}>{msg}</span>
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
            {openCategoriesListBtn}
            <button
              aria-label="关闭横幅"
              style={closeIconBtnStyle}
              type="button"
              onClick={() => dismissJob(job.id)}
            >
              ×
            </button>
          </span>
        </div>
      )
    }

    const derivedOk = mRows.filter((r) => r.ok).length
    const derivedFail = mRows.length - derivedOk
    const okN = typeof job.okCount === 'number' ? job.okCount : derivedOk
    const failN = typeof job.failCount === 'number' ? job.failCount : derivedFail
    const isAllSuccess = failN === 0
    const isRedBanner = failN > 0

    const summaryLine = `DataForSEO 分类槽位拉品已完成（Offer 写入）${siteHint}：成功 ${okN} 个类目，失败 ${failN} 个。${batchHint ? `${batchHint}。` : ''}详情见「Merchant 拉品」「槽位拉取」列。`
    const detail = buildMerchantDispatchDetailBlocks(mRows)
    const titleAttr = clipText(`${summaryLine}\n\n${detail.titleHover}`, 4000)

    return (
      <div
        aria-live={isRedBanner ? 'assertive' : 'polite'}
        role={isRedBanner ? 'alert' : 'status'}
        style={{
          ...baseBar,
          ...badgeStyleForBar(isAllSuccess ? 'done' : 'error'),
        }}
        title={titleAttr}
      >
        <div style={{ flex: '1 1 14rem', minWidth: 0 }}>
          <span style={{ display: 'block' }}>{summaryLine}</span>
          <span
            style={{
              display: 'block',
              marginTop: 6,
              fontSize: '11px',
              lineHeight: 1.45,
              opacity: 0.95,
              whiteSpace: 'pre-line',
              wordBreak: 'break-word',
            }}
          >
            {detail.text}
          </span>
        </div>
        <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
          {openCategoriesListBtn}
          <button
            aria-label="关闭横幅"
            style={closeIconBtnStyle}
            type="button"
            onClick={() => dismissJob(job.id)}
          >
            ×
          </button>
        </span>
      </div>
    )
  }

  if (job.kind === 'trust-pages-bundle-sync') {
    if (job.phase === 'failed') {
      const msg = `信任页包（en）生成失败：${job.errorMessage ?? '未知错误'}`
      return (
        <div
          aria-live="assertive"
          role="alert"
          style={{
            ...baseBar,
            ...badgeStyleForBar('error'),
          }}
        >
          <span style={{ flex: '1 1 12rem' }}>{msg}</span>
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
            {openPagesListBtn}
            <button
              aria-label="关闭横幅"
              style={closeIconBtnStyle}
              type="button"
              onClick={() => dismissJob(job.id)}
            >
              ×
            </button>
          </span>
        </div>
      )
    }

    if (job.phase === 'succeeded') {
      const siteBr = job.siteLabel?.trim() ? `（${job.siteLabel.trim()}）` : ''
      const loc = job.trustPagesBundleLocale?.trim() || 'en'
      const slugLine =
        Array.isArray(job.trustPagesBundleSlugs) && job.trustPagesBundleSlugs.length > 0
          ? job.trustPagesBundleSlugs.join(', ')
          : 'about, contact, privacy, terms, affiliate-disclosure'
      const summaryLine = `信任页包（${loc}）已生成并写回${siteBr}。`
      const detailText = `slug：${slugLine}`
      const titleAttr = clipText(`${summaryLine}\n${detailText}`, 4000)
      return (
        <div
          aria-live="polite"
          role="status"
          style={{
            ...baseBar,
            ...badgeStyleForBar('done'),
          }}
          title={titleAttr}
        >
          <div style={{ flex: '1 1 14rem', minWidth: 0 }}>
            <span style={{ display: 'block' }}>{summaryLine}</span>
            <span
              style={{
                display: 'block',
                marginTop: 6,
                fontSize: '11px',
                lineHeight: 1.45,
                opacity: 0.95,
                whiteSpace: 'pre-line',
                wordBreak: 'break-word',
              }}
            >
              {detailText}
            </span>
          </div>
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
            {openPagesListBtn}
            <button
              aria-label="关闭横幅"
              style={closeIconBtnStyle}
              type="button"
              onClick={() => dismissJob(job.id)}
            >
              ×
            </button>
          </span>
        </div>
      )
    }

    return null
  }

  if (job.kind === 'workflow-jobs-pipeline-sync') {
    if (job.phase === 'failed') {
      const msg = `工作流 · Pipeline 失败：${job.errorMessage ?? '未知错误'}`
      return (
        <div
          aria-live="assertive"
          role="alert"
          style={{
            ...baseBar,
            ...badgeStyleForBar('error'),
          }}
        >
          <span style={{ flex: '1 1 12rem' }}>{msg}</span>
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
            {openWorkflowJobsListBtn}
            <button
              aria-label="关闭横幅"
              style={closeIconBtnStyle}
              type="button"
              onClick={() => dismissJob(job.id)}
            >
              ×
            </button>
          </span>
        </div>
      )
    }

    if (job.phase !== 'succeeded' || !job.workflowJobsPipelineSummary) {
      return null
    }

    const s = job.workflowJobsPipelineSummary
    const hintBr = job.workflowPipelineScopeHint?.trim() ? ` ${job.workflowPipelineScopeHint.trim()}` : ''
    const scopeLine = s.scope === 'selected' ? '勾选 id 范围' : '全局 pending'
    const drainPart = s.drainMode ? ' · 分批' : ''
    const failures = s.tickFailures ?? 0
    const isRed =
      !s.overallOk ||
      failures > 0 ||
      Boolean(s.cappedByMaxBatches) ||
      Boolean(s.errorHint?.trim())
    const summaryLine = `Pipeline run-next 已完成${hintBr}（${scopeLine}${drainPart}）：${s.batches} 批 · 累计 ${s.totalTicks} 次 tick · 末次 stopped=${s.stoppedReason ?? '—'}${failures > 0 ? ` · tick 失败 ${failures}` : ''}`
    const extra = [
      s.cappedByMaxBatches ? '已触达分批上限，勾选范围内可能仍有 pending。' : '',
      s.errorHint?.trim() ?? '',
    ]
      .filter(Boolean)
      .join(' ')
    const titleAttr = clipText(extra ? `${summaryLine}\n${extra}` : summaryLine, 4000)

    return (
      <div
        aria-live={isRed ? 'assertive' : 'polite'}
        role={isRed ? 'alert' : 'status'}
        style={{
          ...baseBar,
          ...badgeStyleForBar(isRed ? 'error' : 'done'),
        }}
        title={titleAttr}
      >
        <div style={{ flex: '1 1 14rem', minWidth: 0 }}>
          <span style={{ display: 'block' }}>{summaryLine}</span>
          {extra ? (
            <span
              style={{
                display: 'block',
                marginTop: 6,
                fontSize: '11px',
                lineHeight: 1.45,
                opacity: 0.95,
                whiteSpace: 'pre-line',
                wordBreak: 'break-word',
              }}
            >
              {extra}
            </span>
          ) : null}
        </div>
        <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
          {openWorkflowJobsListBtn}
          <button
            aria-label="关闭横幅"
            style={closeIconBtnStyle}
            type="button"
            onClick={() => dismissJob(job.id)}
          >
            ×
          </button>
        </span>
      </div>
    )
  }

  if (job.kind === 'keywords-dfs-fetch-sync') {
    if (job.phase === 'failed') {
      const msg = `同步拉取 · DataForSEO（关键词）失败：${job.errorMessage ?? '未知错误'}`
      return (
        <div
          aria-live="assertive"
          role="alert"
          style={{
            ...baseBar,
            ...badgeStyleForBar('error'),
          }}
        >
          <span style={{ flex: '1 1 12rem' }}>{msg}</span>
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
            {openKeywordsListBtn}
            <button
              aria-label="关闭横幅"
              style={closeIconBtnStyle}
              type="button"
              onClick={() => dismissJob(job.id)}
            >
              ×
            </button>
          </span>
        </div>
      )
    }

    if (job.phase !== 'succeeded' || !job.keywordDfsFetchSummary) {
      return null
    }

    const s = job.keywordDfsFetchSummary
    const siteBr = job.siteLabel?.trim() ? `（${job.siteLabel.trim()}）` : ''
    const costUsd =
      typeof s.dataForSeoUsdCharged === 'number' ? ` · DataForSEO +$${s.dataForSeoUsdCharged.toFixed(4)}` : ''
    const persistFails = s.persistErrorCount > 0
    const summaryLine = `同步拉取 · DataForSEO（关键词）已完成${siteBr}：候选 ${s.total} 条 · 新写入 ${s.persisted} · eligible ${s.eligibleCount} · 跳过/未写入 ${s.skipped}${costUsd}。`
    const errs = Array.isArray(s.persistErrorsPreview) ? s.persistErrorsPreview : []
    const detailLines =
      errs.length > 0
        ? errs
            .map((e) => clipText(`· ${e.term} — ${e.message}`, COVER_DETAIL_LINE_MAX))
            .join('\n')
        : ''
    const titleAttr = clipText(
      detailLines ? `${summaryLine}\n\n写入失败 ${s.persistErrorCount} 条：\n${errs.map((e) => `${e.term}: ${e.message}`).join('\n')}` : summaryLine,
      4000,
    )

    return (
      <div
        aria-live={persistFails ? 'assertive' : 'polite'}
        role={persistFails ? 'alert' : 'status'}
        style={{
          ...baseBar,
          ...badgeStyleForBar(persistFails ? 'error' : 'done'),
        }}
        title={titleAttr}
      >
        <div style={{ flex: '1 1 14rem', minWidth: 0 }}>
          <span style={{ display: 'block' }}>{summaryLine}</span>
          {detailLines ? (
            <span
              style={{
                display: 'block',
                marginTop: 6,
                fontSize: '11px',
                lineHeight: 1.45,
                opacity: 0.95,
                whiteSpace: 'pre-line',
                wordBreak: 'break-word',
              }}
            >
              {`写入失败明细（${s.persistErrorCount}）：\n${detailLines}`}
            </span>
          ) : null}
        </div>
        <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
          {openKeywordsListBtn}
          <button
            aria-label="关闭横幅"
            style={closeIconBtnStyle}
            type="button"
            onClick={() => dismissJob(job.id)}
          >
            ×
          </button>
        </span>
      </div>
    )
  }

  if (job.kind === 'keyword-quick-win-preview-sync') {
    if (job.phase === 'failed') {
      const msg = `精选 Quick-win → Brief 预览失败：${job.errorMessage ?? '未知错误'}`
      return (
        <div
          aria-live="assertive"
          role="alert"
          style={{
            ...baseBar,
            ...badgeStyleForBar('error'),
          }}
        >
          <span style={{ flex: '1 1 12rem' }}>{msg}</span>
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
            {openKeywordsListBtn}
            <button
              aria-label="关闭横幅"
              style={closeIconBtnStyle}
              type="button"
              onClick={() => dismissJob(job.id)}
            >
              ×
            </button>
          </span>
        </div>
      )
    }

    if (job.phase !== 'succeeded' || !job.keywordQuickWinPreviewSummary) {
      return null
    }

    const s = job.keywordQuickWinPreviewSummary
    const siteBr = job.siteLabel?.trim() ? `（${job.siteLabel.trim()}）` : ''
    const clusterBad = keywordQuickWinPreviewClusterFailed(s.notices)
    const dfs =
      typeof s.totalDfsCalls === 'number' ? ` · SERP/DataForSEO 调用约 ${s.totalDfsCalls} 次` : ''
    const cl =
      typeof s.clustersCount === 'number' && s.clustersCount > 0 ? ` · 簇 ${s.clustersCount} 个` : ''
    const summaryLine = `精选 Quick-win → Brief 预览完成${siteBr}（dryRun）：pillar 候选 ${s.pickedTotal} 条 / 上限 ${s.limit} · 跳过 ${s.skipped}${dfs}${cl}。`
    const termsLine =
      s.termsPreview.length > 0
        ? `pillar：${s.termsPreview.join('、')}${s.pickedTotal > s.termsPreview.length ? ' …' : ''}`
        : '无 pillar 候选（详见接口 notices / 可调 filters）。'
    const noticeLines =
      Array.isArray(s.notices) && s.notices.length > 0
        ? s.notices.map((n) => clipText(`· ${n}`, COVER_DETAIL_LINE_MAX)).join('\n')
        : ''
    const titleAttr = clipText(
      [summaryLine, termsLine, ...(s.notices ?? [])].filter(Boolean).join('\n'),
      4000,
    )

    const enqueueReplayAvailable =
      !clusterBad && s.pickedTotal > 0 && s.enqueueReplay != null
    const enqueueBusy = qwBriefEnqueueBusyId === job.id
    const enqueueErrThis = qwBriefEnqueueError?.id === job.id ? qwBriefEnqueueError.text : null

    return (
      <div
        aria-live={clusterBad ? 'assertive' : 'polite'}
        role={clusterBad ? 'alert' : 'status'}
        style={{
          ...baseBar,
          ...badgeStyleForBar(clusterBad ? 'error' : 'done'),
        }}
        title={titleAttr}
      >
        <div style={{ flex: '1 1 14rem', minWidth: 0 }}>
          <span style={{ display: 'block' }}>{summaryLine}</span>
          <span
            style={{
              display: 'block',
              marginTop: 6,
              fontSize: '11px',
              lineHeight: 1.45,
              opacity: 0.95,
              whiteSpace: 'pre-line',
              wordBreak: 'break-word',
            }}
          >
            {termsLine}
          </span>
          {noticeLines ? (
            <span
              style={{
                display: 'block',
                marginTop: 6,
                fontSize: '11px',
                lineHeight: 1.45,
                opacity: 0.95,
                whiteSpace: 'pre-line',
                wordBreak: 'break-word',
              }}
            >
              {noticeLines}
            </span>
          ) : null}
        </div>
        <span
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '6px',
            flexShrink: 0,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
            {enqueueReplayAvailable ? (
              <button
                aria-busy={enqueueBusy}
                disabled={enqueueBusy}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: '1px solid var(--theme-elevation-150)',
                  background: 'var(--theme-elevation-0)',
                  cursor: enqueueBusy ? 'wait' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  opacity: enqueueBusy ? 0.75 : 1,
                }}
                type="button"
                onClick={() => {
                  const r = s.enqueueReplay
                  if (!r || clusterBad) return
                  setQwBriefEnqueueBusyId(job.id)
                  setQwBriefEnqueueError((prev) => (prev?.id === job.id ? null : prev))
                  void (async () => {
                    try {
                      const res = await fetch('/api/admin/articles/batch-enqueue', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          siteId: r.siteId,
                          mode: 'quick_wins',
                          dryRun: false,
                          clusterBeforeEnqueue: r.clusterBeforeEnqueue,
                          clusterMinOverlap: r.clusterMinOverlap,
                          filter: r.filter,
                          ...(r.limit != null ? { limit: r.limit } : {}),
                        }),
                      })
                      const data = (await res.json().catch(() => ({}))) as {
                        ok?: boolean
                        error?: string
                      }
                      if (!res.ok || data.ok !== true) {
                        setQwBriefEnqueueError({
                          id: job.id,
                          text:
                            typeof data.error === 'string'
                              ? data.error
                              : `并入队失败（HTTP ${res.status}）`,
                        })
                        setQwBriefEnqueueBusyId(null)
                        return
                      }
                      setQwBriefEnqueueBusyId(null)
                      dismissJob(job.id)
                      router.refresh()
                    } catch {
                      setQwBriefEnqueueError({ id: job.id, text: '并入队请求失败' })
                      setQwBriefEnqueueBusyId(null)
                    }
                  })()
                }}
              >
                {enqueueBusy ? '入队中…' : '并入队 Brief'}
              </button>
            ) : null}
            {openKeywordsListBtn}
            <button
              aria-label="关闭横幅"
              style={closeIconBtnStyle}
              type="button"
              onClick={() => dismissJob(job.id)}
            >
              ×
            </button>
          </span>
          {enqueueErrThis ? (
            <span
              style={{
                fontSize: '11px',
                lineHeight: 1.35,
                color: 'var(--theme-error-500)',
                maxWidth: '18rem',
                textAlign: 'right',
                wordBreak: 'break-word',
              }}
            >
              {enqueueErrThis}
            </span>
          ) : null}
        </span>
      </div>
    )
  }

  if (job.kind !== 'category-cover-sync') {
    return null
  }

  const failN = job.failCount ?? 0
  const isAllSuccess = job.phase === 'succeeded' && failN === 0
  const isRedBanner = job.phase === 'failed' || (job.phase === 'succeeded' && failN > 0)
  const summaryLine =
    job.phase === 'succeeded'
      ? `Together 分类封面已完成：成功 ${job.okCount ?? 0} 条，失败 ${failN} 条。`
      : `Together 分类封面失败：${job.errorMessage ?? '未知错误'}`

  const rows = job.phase === 'succeeded' ? job.coverSyncResults : undefined
  const detail =
    Array.isArray(rows) && rows.length > 0 ? buildCoverSyncDetailBlocks(rows) : null

  const titleAttr =
    detail != null ? clipText(`${summaryLine}\n\n${detail.titleHover}`, 4000) : summaryLine

  return (
    <div
      aria-live={isRedBanner ? 'assertive' : 'polite'}
      role={isRedBanner ? 'alert' : 'status'}
      style={{
        ...baseBar,
        ...badgeStyleForBar(isAllSuccess ? 'done' : 'error'),
      }}
      title={titleAttr}
    >
      <div style={{ flex: '1 1 14rem', minWidth: 0 }}>
        <span style={{ display: 'block' }}>{summaryLine}</span>
        {detail !== null ? (
          <span
            style={{
              display: 'block',
              marginTop: 6,
              fontSize: '11px',
              lineHeight: 1.45,
              opacity: 0.95,
              whiteSpace: 'pre-line',
              wordBreak: 'break-word',
            }}
          >
            {detail.text}
          </span>
        ) : null}
      </div>
      <span style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexShrink: 0 }}>
        {openCategoriesListBtn}
        <button
          aria-label="关闭横幅"
          style={closeIconBtnStyle}
          type="button"
          onClick={() => dismissJob(job.id)}
        >
          ×
        </button>
      </span>
    </div>
  )
}
