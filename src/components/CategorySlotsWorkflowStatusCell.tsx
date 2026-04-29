'use client'

import React from 'react'

import {
  WorkflowStatusBadge,
  normalizeWorkflowStatus,
} from '@/components/workflowStatusBadge'

type CategorySlotsWorkflowStatusCellProps = {
  cellData?: unknown
  rowData?: unknown
  className?: string
}

export function CategorySlotsWorkflowStatusCell(
  props: CategorySlotsWorkflowStatusCellProps,
): React.ReactElement {
  const row = props.rowData as Record<string, unknown> | undefined
  const fromCell = props.cellData
  const fromRow = row?.categorySlotsWorkflowStatus
  const status = normalizeWorkflowStatus(
    fromCell !== undefined && fromCell !== null ? fromCell : fromRow,
  )

  return <WorkflowStatusBadge className={props.className} status={status} />
}
