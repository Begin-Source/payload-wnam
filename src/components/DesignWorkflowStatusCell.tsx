'use client'

import React from 'react'

import {
  WorkflowStatusBadge,
  normalizeWorkflowStatus,
} from '@/components/workflowStatusBadge'

type DesignWorkflowStatusCellProps = {
  cellData?: unknown
  rowData?: unknown
  className?: string
}

const TOOLTIP_MAX = 480

export function DesignWorkflowStatusCell(props: DesignWorkflowStatusCellProps): React.ReactElement {
  const row = props.rowData as Record<string, unknown> | undefined
  const fromCell = props.cellData
  const fromRow = row?.designWorkflowStatus
  const status = normalizeWorkflowStatus(
    fromCell !== undefined && fromCell !== null ? fromCell : fromRow,
  )

  const errCode = row?.designWorkflowLastErrorCode
  const errDetail = row?.designWorkflowLastErrorDetail
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
