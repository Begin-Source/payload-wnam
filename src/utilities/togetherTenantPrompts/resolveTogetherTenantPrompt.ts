import type { Payload } from 'payload'

import type { TenantPromptTemplateKey } from '@/utilities/domainGeneration/promptKeys'
import {
  loadTenantPromptTemplateBody,
  pickTenantPromptPart,
} from '@/utilities/openRouterTenantPrompts/loadTenantPromptTemplateBody'

export async function resolveTogetherTenantPrompt(
  payload: Payload,
  tenantId: number | null,
  key: TenantPromptTemplateKey,
  defaultText: string,
  vars: Record<string, string>,
): Promise<string> {
  if (tenantId == null) return defaultText
  const custom = await loadTenantPromptTemplateBody(payload, tenantId, key)
  return pickTenantPromptPart(custom, defaultText, vars)
}
