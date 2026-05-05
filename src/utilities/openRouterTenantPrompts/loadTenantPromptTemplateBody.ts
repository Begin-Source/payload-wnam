import type { Payload } from 'payload'

import type { TenantPromptTemplateKey } from '@/utilities/domainGeneration/promptKeys'
import { substitutePromptPlaceholders } from '@/utilities/domainGeneration/substitutePromptPlaceholders'

export async function loadTenantPromptTemplateBody(
  payload: Payload,
  tenantId: number,
  key: TenantPromptTemplateKey,
): Promise<string | null> {
  const { docs } = await payload.find({
    collection: 'tenant-prompt-templates',
    where: {
      and: [{ tenant: { equals: tenantId } }, { key: { equals: key } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const row = docs[0] as { body?: string } | undefined
  const body = String(row?.body ?? '').trim()
  return body.length ? body : null
}

export function pickTenantPromptPart(
  custom: string | null,
  defaultText: string,
  vars: Record<string, string>,
): string {
  if (!custom) return defaultText
  return substitutePromptPlaceholders(custom, vars)
}

export async function resolveTenantPromptPair(
  payload: Payload,
  tenantId: number | null,
  systemKey: TenantPromptTemplateKey,
  userKey: TenantPromptTemplateKey,
  defaults: { system: string; user: string },
  vars: Record<string, string>,
): Promise<{ system: string; user: string }> {
  if (tenantId == null) return defaults

  const [sysC, userC] = await Promise.all([
    loadTenantPromptTemplateBody(payload, tenantId, systemKey),
    loadTenantPromptTemplateBody(payload, tenantId, userKey),
  ])

  return {
    system: pickTenantPromptPart(sysC, defaults.system, vars),
    user: pickTenantPromptPart(userC, defaults.user, vars),
  }
}
