import type { Payload } from 'payload'

import { buildAudiencePrompts, buildDomainNamingPrompts } from '@/utilities/domainGeneration/prompts'
import {
  DOMAIN_GEN_AUDIENCE_SYSTEM,
  DOMAIN_GEN_AUDIENCE_USER,
  DOMAIN_GEN_DOMAIN_SYSTEM,
  DOMAIN_GEN_DOMAIN_USER,
  type DomainGenPromptKey,
} from '@/utilities/domainGeneration/promptKeys'
import { substitutePromptPlaceholders } from '@/utilities/domainGeneration/substitutePromptPlaceholders'

type AudienceVars = {
  main_product: string
  site_name: string
  niche: string
  existing_target_audience: string
}

type DomainVars = AudienceVars & {
  selected_target_audience: string
  audience_candidates: string
  current_site_domain: string
}

async function loadTemplateBody(
  payload: Payload,
  tenantId: number,
  key: DomainGenPromptKey,
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

function pickPart(
  custom: string | null,
  defaultText: string,
  vars: Record<string, string>,
): string {
  if (!custom) return defaultText
  return substitutePromptPlaceholders(custom, vars)
}

export async function resolveAudienceStepPrompts(
  payload: Payload,
  tenantId: number | null,
  input: {
    mainProduct: string
    siteName: string
    niche: string
    currentAudience: string
  },
): Promise<{ system: string; user: string }> {
  const defaults = buildAudiencePrompts({
    mainProduct: input.mainProduct,
    siteName: input.siteName,
    niche: input.niche,
    currentAudience: input.currentAudience,
  })

  const vars: AudienceVars = {
    main_product: input.mainProduct || '(empty)',
    site_name: input.siteName || '(empty)',
    niche: input.niche || '(empty)',
    existing_target_audience: input.currentAudience || '(empty)',
  }

  if (tenantId == null) {
    return defaults
  }

  const [sysCustom, userCustom] = await Promise.all([
    loadTemplateBody(payload, tenantId, DOMAIN_GEN_AUDIENCE_SYSTEM),
    loadTemplateBody(payload, tenantId, DOMAIN_GEN_AUDIENCE_USER),
  ])

  return {
    system: pickPart(sysCustom, defaults.system, vars),
    user: pickPart(userCustom, defaults.user, vars),
  }
}

export async function resolveDomainStepPrompts(
  payload: Payload,
  tenantId: number | null,
  input: {
    mainProduct: string
    siteName: string
    niche: string
    selectedAudience: string
    audienceCandidates: string[]
    currentPrimaryDomain: string
  },
): Promise<{ system: string; user: string }> {
  const defaults = buildDomainNamingPrompts({
    mainProduct: input.mainProduct,
    siteName: input.siteName,
    niche: input.niche,
    selectedAudience: input.selectedAudience,
    audienceCandidates: input.audienceCandidates,
    currentPrimaryDomain: input.currentPrimaryDomain,
  })

  const vars: DomainVars = {
    main_product: input.mainProduct || '(empty)',
    site_name: input.siteName || '(empty)',
    niche: input.niche || '(empty)',
    existing_target_audience: '', // not in domain default user; harmless if unused in custom
    selected_target_audience: input.selectedAudience || '(empty)',
    audience_candidates: input.audienceCandidates.length
      ? input.audienceCandidates.join(' | ')
      : '(empty)',
    current_site_domain: input.currentPrimaryDomain || '(empty)',
  }

  if (tenantId == null) {
    return defaults
  }

  const [sysCustom, userCustom] = await Promise.all([
    loadTemplateBody(payload, tenantId, DOMAIN_GEN_DOMAIN_SYSTEM),
    loadTemplateBody(payload, tenantId, DOMAIN_GEN_DOMAIN_USER),
  ])

  return {
    system: pickPart(sysCustom, defaults.system, vars),
    user: pickPart(userCustom, defaults.user, vars),
  }
}
