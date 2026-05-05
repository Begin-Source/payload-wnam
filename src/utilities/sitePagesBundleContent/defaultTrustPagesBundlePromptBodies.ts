import type { Site } from '@/payload-types'

import {
  TRUST_PAGES_BUNDLE_SYSTEM,
  TRUST_PAGES_BUNDLE_USER,
} from '@/utilities/domainGeneration/promptKeys'

function nicheJson(site: Site): string {
  const n = site.nicheData
  if (n && typeof n === 'object' && !Array.isArray(n)) {
    try {
      return JSON.stringify(n)
    } catch {
      return '{}'
    }
  }
  return '{}'
}

export function buildTrustPagesBundlePromptVars(site: Site): Record<string, string> {
  return {
    site_name: String(site.name ?? ''),
    site_domain: String(site.primaryDomain ?? ''),
    main_product: String(site.mainProduct ?? ''),
    niche_json: nicheJson(site),
  }
}

export const DEFAULT_TRUST_PAGES_BUNDLE_SYSTEM =
  'You are a senior SEO editor and policy copywriter for affiliate sites. Return ONLY a valid JSON object with exactly these keys: about_content, contact_content, privacy_content, terms_content, disclosure_content. Each value must be non-empty English Markdown. No extra keys. No markdown fences around the whole response. If you must mention quoted terms, use single quotes in Markdown or bold, not ASCII double quotes inside values.'

export const DEFAULT_TRUST_PAGES_BUNDLE_USER_TEMPLATE = `Context:
- Site name: {{site_name}}
- Site domain: {{site_domain}}
- Main product: {{main_product}}
- Niche data: {{niche_json}}

Task:
Write five standalone site pages in E-E-A-T style.

Formatting for each field:
- One H1 title
- 2-5 H2 subsections
- Short paragraphs and practical bullet lists
- Trustworthy, specific, non-hyped tone

Length targets:
1) about_content: 140-220 words
2) contact_content: 110-170 words
3) privacy_content: 180-280 words
4) terms_content: 180-280 words
5) disclosure_content: 130-200 words

Coverage requirements:
- about: mission, editorial process, review criteria, transparency
- contact: channel, response time, support scope
- privacy: data collection/use, cookies, third parties, user rights, updates
- terms: acceptable use, affiliate notice, no professional advice, liability limits, updates
- disclosure: affiliate mechanism, compensation transparency, editorial independence, reader-first promise

Global output rules:
- Total words across all 5 fields should be 750-1100.
- Complete all five fields fully; do not stop mid-sentence.
- If token budget is tight, shorten all fields proportionally but keep every field complete.

Output:
Return one JSON object with exactly the 5 keys and string values only. In Markdown text, avoid straight double-quote characters; use single quotes or bold instead, so JSON stays valid.`

/** Default bodies for seed migration and code fallback (user string is the placeholder template). */
export const DEFAULT_TRUST_PAGES_BUNDLE_BODIES: Record<
  typeof TRUST_PAGES_BUNDLE_SYSTEM | typeof TRUST_PAGES_BUNDLE_USER,
  string
> = {
  [TRUST_PAGES_BUNDLE_SYSTEM]: DEFAULT_TRUST_PAGES_BUNDLE_SYSTEM,
  [TRUST_PAGES_BUNDLE_USER]: DEFAULT_TRUST_PAGES_BUNDLE_USER_TEMPLATE,
}
