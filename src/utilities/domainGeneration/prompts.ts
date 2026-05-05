/** n8n Build Audience Prompt / Build Prompt 等价文案（常量，不引用外部不可信内容）。 */

import { DEFAULT_DOMAIN_GEN_PROMPT_BODIES } from '@/utilities/domainGeneration/defaultDomainGenPromptBodies'
import {
  DOMAIN_GEN_AUDIENCE_SYSTEM,
  DOMAIN_GEN_AUDIENCE_USER,
  DOMAIN_GEN_DOMAIN_SYSTEM,
  DOMAIN_GEN_DOMAIN_USER,
} from '@/utilities/domainGeneration/promptKeys'
import { substitutePromptPlaceholders } from '@/utilities/domainGeneration/substitutePromptPlaceholders'

export function buildAudiencePrompts(input: {
  mainProduct: string
  siteName: string
  niche: string
  currentAudience: string
}): { system: string; user: string } {
  const { mainProduct, siteName, niche, currentAudience } = input
  const baseTopic = (mainProduct || siteName || niche).trim()
  if (!baseTopic) {
    throw new Error('main_product/site_name/niche are all empty')
  }

  const system = DEFAULT_DOMAIN_GEN_PROMPT_BODIES[DOMAIN_GEN_AUDIENCE_SYSTEM]
  const user = substitutePromptPlaceholders(
    DEFAULT_DOMAIN_GEN_PROMPT_BODIES[DOMAIN_GEN_AUDIENCE_USER],
    {
      main_product: mainProduct || '(empty)',
      site_name: siteName || '(empty)',
      niche: niche || '(empty)',
      existing_target_audience: currentAudience || '(empty)',
    },
  )

  return { system, user }
}

export function buildDomainNamingPrompts(input: {
  mainProduct: string
  siteName: string
  niche: string
  selectedAudience: string
  audienceCandidates: string[]
  currentPrimaryDomain: string
}): { system: string; user: string } {
  const {
    mainProduct,
    siteName,
    niche,
    selectedAudience,
    audienceCandidates,
    currentPrimaryDomain,
  } = input

  const baseTopic = (mainProduct || siteName || niche).trim()
  if (!baseTopic) {
    throw new Error('main_product/site_name/niche are all empty')
  }

  const system = DEFAULT_DOMAIN_GEN_PROMPT_BODIES[DOMAIN_GEN_DOMAIN_SYSTEM]
  const user = substitutePromptPlaceholders(
    DEFAULT_DOMAIN_GEN_PROMPT_BODIES[DOMAIN_GEN_DOMAIN_USER],
    {
      main_product: mainProduct || '(empty)',
      site_name: siteName || '(empty)',
      niche: niche || '(empty)',
      selected_target_audience: selectedAudience || '(empty)',
      audience_candidates: audienceCandidates.length
        ? audienceCandidates.join(' | ')
        : '(empty)',
      current_site_domain: currentPrimaryDomain || '(empty)',
    },
  )

  return { system, user }
}
