'use client'

import React from 'react'

export type WorkflowStatus = 'idle' | 'running' | 'done' | 'error'

export const WORKFLOW_STATUS_LABELS: Record<WorkflowStatus, string> = {
  idle: '代办',
  running: '运行中',
  done: '已完成',
  error: '错误',
}

export const WORKFLOW_STATUS_STYLES: Record<
  WorkflowStatus,
  { background: string; color: string; border: string }
> = {
  idle: {
    background: 'var(--theme-elevation-100)',
    color: 'var(--theme-elevation-800)',
    border: '1px solid var(--theme-elevation-150)',
  },
  running: {
    background: '#ca8a04',
    color: '#ffffff',
    border: '1px solid #a16207',
  },
  done: {
    background: '#16a34a',
    color: '#ffffff',
    border: '1px solid #15803d',
  },
  error: {
    background: '#dc2626',
    color: '#ffffff',
    border: '1px solid #b91c1c',
  },
}

export function normalizeWorkflowStatus(raw: unknown): WorkflowStatus {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (s === 'running' || s === 'done' || s === 'error' || s === 'idle') return s
  return 'idle'
}

export function WorkflowStatusBadge(props: {
  status: WorkflowStatus
  className?: string
}): React.ReactElement {
  const label = WORKFLOW_STATUS_LABELS[props.status]
  const st = WORKFLOW_STATUS_STYLES[props.status]

  return (
    <span
      className={props.className}
      style={{
        display: 'inline-block',
        padding: '0.2rem 0.55rem',
        borderRadius: 6,
        fontSize: '0.8125rem',
        fontWeight: 600,
        lineHeight: 1.35,
        ...st,
      }}
    >
      {label}
    </span>
  )
}
