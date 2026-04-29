import type { Site } from '@/payload-types'

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

export function buildUserPromptForTrustPagesBundle(site: Site): string {
  const siteName = String(site.name ?? '')
  const siteDomain = String(site.primaryDomain ?? '')
  const mainProduct = String(site.mainProduct ?? '')
  return `Context:
- Site name: ${siteName}
- Site domain: ${siteDomain}
- Main product: ${mainProduct}
- Niche data: ${nicheJson(site)}

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
}

export const SYSTEM_PROMPT_TRUST_PAGES_BUNDLE =
  'You are a senior SEO editor and policy copywriter for affiliate sites. Return ONLY a valid JSON object with exactly these keys: about_content, contact_content, privacy_content, terms_content, disclosure_content. Each value must be non-empty English Markdown. No extra keys. No markdown fences around the whole response. If you must mention quoted terms, use single quotes in Markdown or bold, not ASCII double quotes inside values.'

export const DEFAULT_TRUST_BUNDLE_MODEL = 'google/gemini-2.5-flash'
