import { loadTenantPromptTemplateBody } from '@/utilities/openRouterTenantPrompts/loadTenantPromptTemplateBody'
import type { Payload } from 'payload'

import {
  CATEGORY_SLOTS_SHORTNAME_SYSTEM,
  CATEGORY_SLOTS_SHORTNAME_USER,
  type CategorySlotsPromptKey,
} from '@/utilities/domainGeneration/promptKeys'
import { substitutePromptPlaceholders } from '@/utilities/domainGeneration/substitutePromptPlaceholders'

import { buildCategorySlotsRowsJson, buildShortnamePrompts } from './aiPrompt'
import type { GateInputRow } from './gate'

async function loadTemplateBody(
  payload: Payload,
  tenantId: number,
  key: CategorySlotsPromptKey,
): Promise<string | null> {
  return loadTenantPromptTemplateBody(payload, tenantId, key)
}

function pickPromptPart(
  custom: string | null,
  defaultText: string,
  vars: Record<string, string>,
): string {
  if (!custom) return defaultText
  return substitutePromptPlaceholders(custom, vars)
}

export async function resolveCategorySlotsShortnamePrompts(
  payload: Payload,
  tenantId: number | null,
  toGenerate: GateInputRow[],
): Promise<{ systemPrompt: string; userPrompt: string }> {
  const defaults = buildShortnamePrompts(toGenerate)
  if (!toGenerate.length) {
    return defaults
  }

  const rowsJson = buildCategorySlotsRowsJson(toGenerate)
  const vars = { rows_json: rowsJson }

  if (tenantId == null) {
    return defaults
  }

  const [sysCustom, userCustom] = await Promise.all([
    loadTemplateBody(payload, tenantId, CATEGORY_SLOTS_SHORTNAME_SYSTEM),
    loadTemplateBody(payload, tenantId, CATEGORY_SLOTS_SHORTNAME_USER),
  ])

  return {
    systemPrompt: pickPromptPart(sysCustom, defaults.systemPrompt, vars),
    userPrompt: pickPromptPart(userCustom, defaults.userPrompt, vars),
  }
}
