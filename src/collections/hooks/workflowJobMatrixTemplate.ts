import type { CollectionBeforeChangeHook } from 'payload'

import {
  defaultInputForMatrixTemplate,
  type WorkflowMatrixTemplateId,
} from '@/constants/workflowJobMatrixTemplates'
import { checkPipelineSpendForJob } from '@/utilities/siteQuotaCheck'

const MATRIX_TEMPLATE_KEYS = [
  'new_site_checklist',
  'bulk_keyword_sync',
  'post_publish_ping',
] as const satisfies readonly Exclude<WorkflowMatrixTemplateId, ''>[]

const TEMPLATE_IDS = new Set<string>(MATRIX_TEMPLATE_KEYS)

function isNonEmptyInput(input: unknown): boolean {
  if (input == null) return false
  if (typeof input === 'object' && !Array.isArray(input)) {
    return Object.keys(input as object).length > 0
  }
  return true
}

/** Fills `input` from matrix template presets on create when input is empty. */
export const applyWorkflowMatrixTemplate: CollectionBeforeChangeHook = ({ data, operation }) => {
  if (operation !== 'create') return data
  const row = { ...(data as Record<string, unknown>) }
  const key = row.matrixTemplate
  if (typeof key !== 'string' || key === '' || !TEMPLATE_IDS.has(key)) {
    return data
  }
  if (isNonEmptyInput(row.input)) return data
  row.input = defaultInputForMatrixTemplate(key as Exclude<WorkflowMatrixTemplateId, ''>)
  return row
}

function siteIdFromJobData(data: Record<string, unknown>): number | null {
  const site = data.site
  if (typeof site === 'number' && Number.isFinite(site)) return site
  if (typeof site === 'object' && site !== null && 'id' in site) {
    const id = (site as { id: unknown }).id
    if (typeof id === 'number' && Number.isFinite(id)) return id
  }
  return null
}

/** Enforces per-site pipeline spend caps from `site-quotas` / estimates (matrix governance). */
export const guardWorkflowJobPipelineSpend: CollectionBeforeChangeHook = async ({
  data,
  req,
  operation,
}) => {
  if (operation !== 'create') return data
  const row = data as Record<string, unknown>
  const jobType = typeof row.jobType === 'string' ? row.jobType : ''
  const siteId = siteIdFromJobData(row)
  if (!jobType || siteId == null) return data
  const check = await checkPipelineSpendForJob(req.payload, siteId, jobType)
  if (!check.ok) {
    throw new Error(check.message)
  }
  return data
}
