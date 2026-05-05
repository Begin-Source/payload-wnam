import type { Site } from '@/payload-types'

import { substitutePromptPlaceholders } from '@/utilities/domainGeneration/substitutePromptPlaceholders'

import {
  DEFAULT_TRUST_PAGES_BUNDLE_SYSTEM,
  DEFAULT_TRUST_PAGES_BUNDLE_USER_TEMPLATE,
  buildTrustPagesBundlePromptVars,
} from '@/utilities/sitePagesBundleContent/defaultTrustPagesBundlePromptBodies'

export const SYSTEM_PROMPT_TRUST_PAGES_BUNDLE = DEFAULT_TRUST_PAGES_BUNDLE_SYSTEM

export function buildUserPromptForTrustPagesBundle(site: Site): string {
  return substitutePromptPlaceholders(
    DEFAULT_TRUST_PAGES_BUNDLE_USER_TEMPLATE,
    buildTrustPagesBundlePromptVars(site),
  )
}

export { buildTrustPagesBundlePromptVars } from '@/utilities/sitePagesBundleContent/defaultTrustPagesBundlePromptBodies'

export const DEFAULT_TRUST_BUNDLE_MODEL = 'google/gemini-2.5-flash'
