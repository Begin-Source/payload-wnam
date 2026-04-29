'use client'

import React from 'react'

import {
  WorkflowStatusBadge,
  normalizeWorkflowStatus,
} from '@/components/workflowStatusBadge'
import { TRUST_BUNDLE_SLUGS, TRUST_BUNDLE_LOCALE } from '@/utilities/sitePagesBundleContent/trustPageConstants'

type Props = {
  cellData?: unknown
  rowData?: unknown
  className?: string
}

const TOOLTIP_MAX = 480

function isTrustRow(row: Record<string, unknown> | undefined): boolean {
  if (!row) return false
  const locale = row.locale
  const slug = row.slug
  if (locale !== TRUST_BUNDLE_LOCALE) return false
  return typeof slug === 'string' && (TRUST_BUNDLE_SLUGS as readonly string[]).includes(slug)
}

export function SitePagesBundleWorkflowStatusCell(props: Props): React.ReactElement {
  const row = props.rowData as Record<string, unknown> | undefined
  if (!isTrustRow(row)) {
    return (
      <span style={{ opacity: 0.45, fontSize: '0.8125rem' }} title="仅 about / contact / privacy / terms / affiliate-disclosure（en）显示">
        —
      </span>
    )
  }

  const fromCell = props.cellData
  const fromRow = row?.sitePagesBundleWorkflowStatus
  const status = normalizeWorkflowStatus(
    fromCell !== undefined && fromCell !== null ? fromCell : fromRow,
  )

  const errCode = row?.sitePagesBundleLastErrorCode
  const errDetail = row?.sitePagesBundleLastErrorDetail
  let title: string | undefined
  if (status === 'error' && (errCode != null || errDetail != null)) {
    const parts = [
      typeof errCode === 'string' && errCode.trim() ? errCode.trim() : '',
      typeof errDetail === 'string' && errDetail.trim() ? errDetail.trim() : '',
    ].filter(Boolean)
    if (parts.length > 0) {
      title = parts.join(' — ')
      if (title.length > TOOLTIP_MAX) {
        title = `${title.slice(0, TOOLTIP_MAX)}…`
      }
    }
  }

  return (
    <span style={{ display: 'inline-flex' }} title={title}>
      <WorkflowStatusBadge className={props.className} status={status} />
    </span>
  )
}
