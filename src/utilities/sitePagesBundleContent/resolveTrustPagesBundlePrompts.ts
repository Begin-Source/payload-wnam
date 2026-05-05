import type { Payload } from 'payload'

import type { Site } from '@/payload-types'

import {
  TRUST_PAGES_BUNDLE_SYSTEM,
  TRUST_PAGES_BUNDLE_USER,
  type TrustPagesBundlePromptKey,
} from '@/utilities/domainGeneration/promptKeys'
import { substitutePromptPlaceholders } from '@/utilities/domainGeneration/substitutePromptPlaceholders'

import { buildTrustPagesBundlePromptVars } from '@/utilities/sitePagesBundleContent/defaultTrustPagesBundlePromptBodies'
import {
  buildUserPromptForTrustPagesBundle,
  SYSTEM_PROMPT_TRUST_PAGES_BUNDLE,
} from '@/utilities/sitePagesBundleContent/sitePagesBundleOpenRouterPrompts'

async function loadTemplateBody(
  payload: Payload,
  tenantId: number,
  key: TrustPagesBundlePromptKey,
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

function pickPromptPart(
  custom: string | null,
  defaultText: string,
  vars: Record<string, string>,
): string {
  if (!custom) return defaultText
  return substitutePromptPlaceholders(custom, vars)
}

export async function resolveTrustPagesBundlePrompts(
  payload: Payload,
  tenantId: number | null,
  site: Site,
): Promise<{ system: string; user: string }> {
  const defaults = {
    system: SYSTEM_PROMPT_TRUST_PAGES_BUNDLE,
    user: buildUserPromptForTrustPagesBundle(site),
  }
  if (tenantId == null) {
    return defaults
  }

  const vars = buildTrustPagesBundlePromptVars(site)

  const [sysCustom, userCustom] = await Promise.all([
    loadTemplateBody(payload, tenantId, TRUST_PAGES_BUNDLE_SYSTEM),
    loadTemplateBody(payload, tenantId, TRUST_PAGES_BUNDLE_USER),
  ])

  return {
    system: pickPromptPart(sysCustom, defaults.system, vars),
    user: pickPromptPart(userCustom, defaults.user, vars),
  }
}
