
import type { BackgroundActivityJob, CategoryCoverSyncRowResult, CategorySlotsSyncRowResult, MerchantSlotDispatchRowResult } from '@/components/adminBackgroundActivity/AdminBackgroundActivityContext'

export const BANNER_Z = 9990

export const LIST_BANNER_KINDS = [
  'category-cover-sync',
  'category-slots-sync',
  'merchant-slot-dispatch-sync',
  'trust-pages-bundle-sync',
  'keywords-dfs-fetch-sync',
  'keyword-quick-win-preview-sync',
  'keyword-batch-mode-preview-sync',
  'content-brief-draft-skeleton-preview-sync',
  'batch-enqueue-sync',
  'workflow-jobs-pipeline-sync',
  'site-record-save-sync',
  'content-management-action-sync',
] as const

export function inListBannerScope(j: BackgroundActivityJob): boolean {
  return (LIST_BANNER_KINDS as readonly string[]).includes(j.kind)
}

export const COVER_DETAIL_LINE_MAX = 160

export const COVER_SUCCESS_PREVIEW = 3

export const SLOTS_DETAIL_LINE_MAX = COVER_DETAIL_LINE_MAX

export const SLOTS_SUCCESS_PREVIEW = COVER_SUCCESS_PREVIEW

export const MERCHANT_DETAIL_LINE_MAX = COVER_DETAIL_LINE_MAX

export const MERCHANT_SUCCESS_PREVIEW = COVER_SUCCESS_PREVIEW

export function formatMerchantDispatchShortLabel(row: MerchantSlotDispatchRowResult): string {
  const head = `#${row.categoryId}`
  if (!row.ok) return `${head} — ${(row.error || '失败').trim()}`
  if (row.skipped) {
    const note = row.writebackNote?.trim()
    return note ? `${head} · 已跳过派发 · ${note}` : `${head} · 已跳过派发`
  }
  const parts = [head]
  if (row.tag?.trim()) parts.push(`tag ${row.tag.trim()}`)
  if (typeof row.offersMarkedRunning === 'number')
    parts.push(`槽位标记 +${row.offersMarkedRunning}`)
  const note = row.writebackNote?.trim()
  if (note) parts.push(note)
  return parts.join(' · ')
}

export function buildMerchantDispatchDetailBlocks(rows: MerchantSlotDispatchRowResult[]): {
  text: string
  titleHover: string
} {
  const fails = rows.filter((r) => !r.ok)
  const oks = rows.filter((r) => r.ok)
  const chunks: string[] = []
  const hover: string[] = []

  if (oks.length > 0) {
    if (oks.length <= MERCHANT_SUCCESS_PREVIEW) {
      chunks.push(
        `Offer 写入成功（${oks.length} 个）：${oks.map(formatMerchantDispatchShortLabel).join('；')}`,
      )
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

export function clipText(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export function keywordQuickWinPreviewClusterFailed(notices: string[] | undefined): boolean {
  return (notices ?? []).some((n) => n.includes('SERP 聚类失败'))
}

export function batchEnqueueSummaryIsError(s: { enqueued: number; errorsSample?: string[] }): boolean {
  return s.enqueued === 0 && (s.errorsSample?.length ?? 0) > 0
}

export function formatCoverRowShortLabel(row: CategoryCoverSyncRowResult): string {
  const name = row.name?.trim()
  const slug = row.slug?.trim()
  const idPrefix = `#${row.categoryId}`
  if (name && slug) return `${idPrefix} ${name} (${slug})`
  if (name) return `${idPrefix} ${name}`
  if (slug) return `${idPrefix} ${slug}`
  return idPrefix
}

export function buildCoverSyncDetailBlocks(rows: CategoryCoverSyncRowResult[]): {
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

export function formatSlotsRowShortLabel(row: CategorySlotsSyncRowResult): string {
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

export function buildSlotsSyncDetailBlocks(rows: CategorySlotsSyncRowResult[]): {
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
      const preview = oks.slice(0, SLOTS_SUCCESS_PREVIEW).map(formatSlotsRowShortLabel).join('；')
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
