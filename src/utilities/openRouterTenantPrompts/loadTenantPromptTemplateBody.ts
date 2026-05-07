import type { Payload } from 'payload'
import type { Where } from 'payload'

import type { TenantPromptTemplateKey } from '@/utilities/domainGeneration/promptKeys'
import { substitutePromptPlaceholders } from '@/utilities/domainGeneration/substitutePromptPlaceholders'

async function readTemplateBody(payload: Payload, where: Where): Promise<string | null> {
  const { docs } = await payload.find({
    collection: 'tenant-prompt-templates',
    where,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const row = docs[0] as { body?: string } | undefined
  const body = String(row?.body ?? '').trim()
  return body.length ? body : null
}

export async function loadTenantPromptTemplateBody(
  payload: Payload,
  tenantId: number,
  key: TenantPromptTemplateKey,
  pipelineProfileId?: number | null,
): Promise<string | null> {
  const pid =
    typeof pipelineProfileId === 'number' && Number.isFinite(pipelineProfileId)
      ? Math.floor(pipelineProfileId)
      : null

  if (pid != null) {
    const scoped = await readTemplateBody(payload, {
      and: [
        { tenant: { equals: tenantId } },
        { key: { equals: key } },
        { pipelineProfile: { equals: pid } },
      ],
    })
    if (scoped) return scoped
  }

  return readTemplateBody(payload, {
    and: [
      { tenant: { equals: tenantId } },
      { key: { equals: key } },
      { pipelineProfile: { equals: null } },
    ],
  })
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
  pipelineProfileId?: number | null,
): Promise<{ system: string; user: string }> {
  if (tenantId == null) return defaults

  const [sysC, userC] = await Promise.all([
    loadTenantPromptTemplateBody(payload, tenantId, systemKey, pipelineProfileId),
    loadTenantPromptTemplateBody(payload, tenantId, userKey, pipelineProfileId),
  ])

  return {
    system: pickTenantPromptPart(sysC, defaults.system, vars),
    user: pickTenantPromptPart(userC, defaults.user, vars),
  }
}
