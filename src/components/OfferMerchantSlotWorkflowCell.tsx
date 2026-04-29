'use client'

import React from 'react'

import {
  WorkflowStatusBadge,
  normalizeWorkflowStatus,
} from '@/components/workflowStatusBadge'

type OfferMerchantSlotWorkflowCellProps = {
  cellData?: unknown
  rowData?: unknown
  className?: string
}

export function OfferMerchantSlotWorkflowCell(
  props: OfferMerchantSlotWorkflowCellProps,
): React.ReactElement {
  const row = props.rowData as Record<string, unknown> | undefined
  const fromCell = props.cellData
  const nested = row?.merchantSlot as Record<string, unknown> | undefined
  const fromRow = nested?.workflowStatus ?? row?.workflowStatus
  const status = normalizeWorkflowStatus(
    fromCell !== undefined && fromCell !== null ? fromCell : fromRow,
  )

  return <WorkflowStatusBadge className={props.className} status={status} />
}
