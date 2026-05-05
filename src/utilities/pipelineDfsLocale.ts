import {
  AMZ_DEFAULT_LANGUAGE_CODE,
  AMZ_DEFAULT_LOCATION_CODE,
} from '@/services/integrations/dataforseo/amzDefaults'
import type { PipelineSettingShape } from '@/utilities/pipelineSettingShape'

/** Lowercase ISO 3166-1 alpha-2 → common DataForSEO `location_code` (Google). */
const REGION_LOCATION_CODE: Record<string, number> = {
  us: 2840,
  uk: 2826,
  gb: 2826,
  de: 2276,
  fr: 2250,
  ca: 2124,
  au: 2036,
  jp: 2392,
  in: 2360,
  br: 2076,
  mx: 2484,
  es: 2724,
  it: 2274,
  nl: 2528,
}

/** Short marketplace hints (pipeline global / profile). */
const MARKETPLACE_HINT: Record<string, { location_code: number; language_code: string }> = {
  us: { location_code: 2840, language_code: 'en' },
  'amazon.com': { location_code: 2840, language_code: 'en' },
  uk: { location_code: 2826, language_code: 'en' },
  'amazon.co.uk': { location_code: 2826, language_code: 'en' },
  de: { location_code: 2276, language_code: 'de' },
  'amazon.de': { location_code: 2276, language_code: 'de' },
  fr: { location_code: 2250, language_code: 'fr' },
  jp: { location_code: 2392, language_code: 'ja' },
  ca: { location_code: 2124, language_code: 'en' },
  au: { location_code: 2036, language_code: 'en' },
}

function normKey(s: string): string {
  return s.trim().toLowerCase()
}

/**
 * DFS SERP / keyword location defaults from merged pipeline settings.
 * Falls back to AMZ US English when unset or unknown.
 */
export function resolveDfsLocationLanguageFromMerged(
  merged: PipelineSettingShape,
): { location_code: number; language_code: string } {
  let location_code = AMZ_DEFAULT_LOCATION_CODE
  let language_code = AMZ_DEFAULT_LANGUAGE_CODE

  const regionRaw = merged.defaultRegion
  if (typeof regionRaw === 'string' && regionRaw.trim()) {
    const k = normKey(regionRaw)
    const loc = REGION_LOCATION_CODE[k]
    if (typeof loc === 'number') location_code = loc
  }

  const locRaw = merged.defaultLocale
  if (typeof locRaw === 'string' && locRaw.trim()) {
    const seg = locRaw.trim().split(/[-_]/)[0]?.toLowerCase()
    if (seg && /^[a-z]{2}$/.test(seg)) language_code = seg
  }

  const mp = merged.amazonMarketplace
  if (typeof mp === 'string' && mp.trim()) {
    const k = normKey(mp).replace(/^www\./, '')
    const hint = MARKETPLACE_HINT[k]
    if (hint) {
      location_code = hint.location_code
      language_code = hint.language_code
    }
  }

  return { location_code, language_code }
}
