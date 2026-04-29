'use client'

import React from 'react'

import {
  WorkflowStatusBadge,
  normalizeWorkflowStatus,
} from '@/components/workflowStatusBadge'

/** Payload list Cell props (subset; aligns with admin.components.Cell). */
type DomainWorkflowStatusCellProps = {
  cellData?: unknown
  rowData?: unknown
  className?: string
}

export function DomainWorkflowStatusCell(props: DomainWorkflowStatusCellProps): React.ReactElement {
  const row = props.rowData as Record<string, unknown> | undefined
  const fromCell = props.cellData
  const fromRow = row?.domainWorkflowStatus
  const status = normalizeWorkflowStatus(
    fromCell !== undefined && fromCell !== null ? fromCell : fromRow,
  )

  return <WorkflowStatusBadge className={props.className} status={status} />
}
