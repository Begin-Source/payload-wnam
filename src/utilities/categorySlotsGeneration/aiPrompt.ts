import type { GateInputRow } from './gate'

import {
  DEFAULT_CATEGORY_SLOTS_SHORTNAME_BODIES,
  formatCategorySlotsUserPromptFromRowsJson,
} from './defaultCategorySlotsPromptBodies'
import { CATEGORY_SLOTS_SHORTNAME_SYSTEM } from '@/utilities/domainGeneration/promptKeys'

function normalizeField(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildCategorySlotsPromptRows(toGenerate: GateInputRow[]): Array<{
  id: string
  site_id: number | null
  main_product: string
  site_name: string
  target_audience: string
}> {
  return toGenerate.map((row) => ({
    id: String(row.id ?? ''),
    site_id: row.site_id ?? null,
    main_product: normalizeField(row.main_product),
    site_name: normalizeField(row.site_name),
    target_audience: normalizeField(row.target_audience),
  }))
}

export function buildCategorySlotsRowsJson(toGenerate: GateInputRow[]): string {
  if (!toGenerate.length) return '[]'
  return JSON.stringify(buildCategorySlotsPromptRows(toGenerate))
}

export function buildShortnamePrompts(toGenerate: GateInputRow[]): {
  systemPrompt: string
  userPrompt: string
} {
  if (!toGenerate.length) {
    return { systemPrompt: '', userPrompt: '' }
  }

  const rowsJson = buildCategorySlotsRowsJson(toGenerate)
  const systemPrompt = DEFAULT_CATEGORY_SLOTS_SHORTNAME_BODIES[CATEGORY_SLOTS_SHORTNAME_SYSTEM]
  const userPrompt = formatCategorySlotsUserPromptFromRowsJson(rowsJson)

  return { systemPrompt, userPrompt }
}
