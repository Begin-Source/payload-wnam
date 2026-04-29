'use client'

import React from 'react'

import {
  WorkflowStatusBadge,
  normalizeWorkflowStatus,
} from '@/components/workflowStatusBadge'

type Props = {
  cellData?: unknown
  rowData?: unknown
  className?: string
}

/** List cell for `merchantOfferFetchWorkflowStatus` on Categories (DFS → Offers pipeline). */
export function CategoryMerchantOfferFetchWorkflowCell(props: Props): React.ReactElement {
  const row = props.rowData as Record<string, unknown> | undefined
  const fromCell = props.cellData
  const fromRow = row?.merchantOfferFetchWorkflowStatus
  const status = normalizeWorkflowStatus(
    fromCell !== undefined && fromCell !== null ? fromCell : fromRow,
  )

  return <WorkflowStatusBadge className={props.className} status={status} />
}
