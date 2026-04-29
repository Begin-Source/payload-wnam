import type { Site } from '@/payload-types'

import { supportEmailForSite } from '@/utilities/sitePagesBundleContent/trustPageConstants'

type ContentKey =
  | 'about_content'
  | 'contact_content'
  | 'privacy_content'
  | 'terms_content'
  | 'disclosure_content'

const FIELD_KEYS: ContentKey[] = [
  'about_content',
  'contact_content',
  'privacy_content',
  'terms_content',
  'disclosure_content',
]

const TITLES: Record<ContentKey, string> = {
  about_content: 'About Us',
  contact_content: 'Contact Us',
  privacy_content: 'Privacy Policy',
  terms_content: 'Terms of Service',
  disclosure_content: 'Affiliate Disclosure',
}

const MIN_WORDS: Record<ContentKey, number> = {
  about_content: 130,
  contact_content: 100,
  privacy_content: 170,
  terms_content: 170,
  disclosure_content: 120,
}

function tryParseJson(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return null
  }
}

function repairJsonString(value: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]
    if (inString) {
      if (escaped) {
        escaped = false
        out += ch
        continue
      }
      if (ch === '\\') {
        escaped = true
        out += ch
        continue
      }
      if (ch === '\n' || ch === '\r') {
        out += '\\n'
        continue
      }
      if (ch === '"') {
        inString = false
        out += ch
        continue
      }
      out += ch
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      continue
    }
    out += ch
  }
  return out
}

function normalizeValueForRegexExtract(value: string): string {
  let out = value.trim()
  if (out.startsWith('"')) out = out.slice(1)
  if (out.endsWith('",')) out = out.slice(0, -2)
  if (out.endsWith('"')) out = out.slice(0, -1)
  out = out.replace(/\\n/g, '\n')
  out = out.replace(/\\"/g, '"')
  return out.trim()
}

function longFallbacks(site: Site): Record<ContentKey, string> {
  const siteName = String(site.name ?? site.primaryDomain ?? 'our site')
  const supportEmail = supportEmailForSite(site)
  return {
    about_content: `# About ${siteName}

## Who We Are
${siteName} is an independent product-information website focused on practical guidance for everyday buyers. Our goal is to help readers quickly understand what matters before buying, using clear language and realistic expectations.

## How We Create Content
Our editorial process combines product specifications, user-reported experience, and marketplace signals. We prioritize useful details such as reliability, ease of use, maintenance needs, and long-term value. We update content when products change, availability shifts, or better options appear.

## How We Evaluate Recommendations
We compare products using consistent criteria:
- Core performance in real-world daily use
- Feature usefulness versus marketing claims
- Build quality, support, and expected durability
- Price-to-value fit for different budgets

## Transparency
We may earn commissions from qualifying purchases through affiliate links. This does not increase your price. Editorial decisions are made independently, and we do not accept paid placement disguised as recommendations.`,

    contact_content: `# Contact ${siteName}

## Contact Channel
If you have questions, correction requests, or partnership inquiries, email us at **${supportEmail}**.

## What We Can Help With
- Clarifying how we evaluated a product
- Reporting outdated information or broken links
- Suggesting topics you want us to cover

## Response Time
We usually reply within 1-3 business days. Complex requests may take longer if we need to verify additional details.

## Note
We do not provide manufacturer warranty service or product repair support. For returns, defects, or account-specific order issues, please contact the retailer or manufacturer directly.`,

    privacy_content: `# Privacy Policy

## Information We Collect
We may collect limited technical data such as IP address, browser type, pages visited, and referral source for analytics and performance monitoring. If you contact us by email, we collect your message details and contact information needed to respond.

## How We Use Information
We use data to improve site quality, troubleshoot issues, and understand which content is useful. We do not sell personal information. We keep data access limited to legitimate operational purposes.

## Cookies and Similar Technologies
We may use cookies for basic functionality, analytics, and affiliate attribution. You can manage cookies through browser settings. Disabling cookies may reduce certain site features.

## Third-Party Services
Our pages may include links to third-party websites and services. Their privacy practices are governed by their own policies. We encourage you to review those policies before sharing personal data.

## Your Choices and Rights
Depending on your region, you may request access, correction, or deletion of personal data we control. For requests, contact us at **${supportEmail}**.

## Updates
We may revise this policy as our site and legal requirements evolve. The latest version on this page applies from the posted effective date.`,

    terms_content: `# Terms of Service

## Acceptance of Terms
By accessing or using this website, you agree to these Terms of Service and applicable laws. If you do not agree, please stop using the site.

## Informational Use Only
Content is provided for general informational purposes and should not be treated as legal, financial, medical, or other professional advice. You are responsible for your own decisions and verification.

## Acceptable Use
You agree not to misuse the site, attempt unauthorized access, disrupt service, or reuse content in violation of copyright and applicable law.

## Affiliate and Commercial Relationships
Some links may be affiliate links. We may receive compensation when purchases are made through those links, at no extra cost to you. Compensation does not guarantee favorable coverage.

## No Warranty
The site and content are provided on an "as is" basis without warranties of any kind, including completeness, reliability, or fitness for a particular purpose.

## Limitation of Liability
To the maximum extent permitted by law, we are not liable for indirect, incidental, or consequential damages arising from use of the site or reliance on content.

## Changes
We may update these terms periodically. Continued use after updates means you accept the revised terms.`,

    disclosure_content: `# Affiliate Disclosure

## How Affiliate Links Work
Some links on this website are affiliate links. If you click and purchase, we may earn a commission from the merchant. Your purchase price does not increase because of this.

## Editorial Independence
Our recommendations are based on editorial standards, not commission size. We aim to highlight practical pros, limitations, and fit-for-purpose guidance so readers can make informed choices.

## Transparency Commitment
We disclose affiliate relationships to maintain trust with readers. Where relevant, we also note sponsorships or material relationships that could influence content context.

## Reader-First Principle
Our priority is long-term reader value: accurate information, clear comparisons, and honest trade-offs. If you spot an issue, contact us at **${supportEmail}** and we will review it.`,
  }
}

function countWords(value: string): number {
  return String(value || '')
    .replace(/[#*>`\-\[\]()-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length
}

function looksTruncated(value: string): boolean {
  const v = String(value || '').trim()
  if (!v) return true
  if (/[([{,:;\-]$/.test(v)) return true
  const lines = v.split(/\r?\n/).filter(Boolean)
  const last = lines[lines.length - 1] || ''
  return !/[.!?]$/.test(last.trim())
}

/**
 * OpenRouter `choices[0].message.content` (JSON string) + finish_reason; outputs five markdown fields (n8n "Extract JSON").
 */
export function extractSitePagesBundleFromModelText(
  site: Site,
  modelText: string,
  finishReason: string,
): Record<ContentKey, string> {
  let text = modelText.trim()
  text = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  text = text.replace(/^json\s*/i, '').trim()

  let parsed: Record<string, unknown> | null = tryParseJson(text)
  if (!parsed) parsed = tryParseJson(repairJsonString(text))
  if (!parsed) {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) {
      const slice = text.slice(start, end + 1)
      parsed = tryParseJson(slice) || tryParseJson(repairJsonString(slice))
    }
  }

  if (!parsed) {
    const keys: ContentKey[] = [...FIELD_KEYS]
    const positions: { key: ContentKey; index: number; length: number }[] = []
    for (const key of keys) {
      const re = new RegExp(`"${key}"\\s*:`, 'i')
      const match = re.exec(text)
      if (match) positions.push({ key, index: match.index, length: match[0].length })
    }
    if (positions.length) {
      positions.sort((a, b) => a.index - b.index)
      const sections: Record<ContentKey, string> = {
        about_content: '',
        contact_content: '',
        privacy_content: '',
        terms_content: '',
        disclosure_content: '',
      }
      for (let i = 0; i < positions.length; i += 1) {
        const current = positions[i]
        const next = positions[i + 1]
        const startIndex = current.index + current.length
        const endIndex = next ? next.index : text.length
        sections[current.key] = normalizeValueForRegexExtract(text.slice(startIndex, endIndex))
      }
      if (Object.values(sections).some((value) => value)) {
        parsed = sections as unknown as Record<string, unknown>
      }
    }
  }

  if (!parsed) {
    parsed = {
      about_content: '',
      contact_content: '',
      privacy_content: '',
      terms_content: '',
      disclosure_content: '',
    }
  }

  const fb = longFallbacks(site)
  const ensure = (key: ContentKey) => {
    const v = parsed![key]
    if (v == null || !String(v).trim()) {
      ;(parsed as Record<string, string>)[key] = fb[key]
    }
  }
  for (const k of FIELD_KEYS) ensure(k)

  const hitLimit = finishReason === 'length'
  for (const key of FIELD_KEYS) {
    const s = String((parsed as Record<string, string>)[key] ?? '')
    const wc = countWords(s)
    const truncated = looksTruncated(s)
    if (
      wc < MIN_WORDS[key] ||
      truncated ||
      (hitLimit && wc < MIN_WORDS[key] + 20)
    ) {
      ;(parsed as Record<string, string>)[key] = fb[key]
    }
  }

  return {
    about_content: String((parsed as Record<string, string>).about_content ?? ''),
    contact_content: String((parsed as Record<string, string>).contact_content ?? ''),
    privacy_content: String((parsed as Record<string, string>).privacy_content ?? ''),
    terms_content: String((parsed as Record<string, string>).terms_content ?? ''),
    disclosure_content: String((parsed as Record<string, string>).disclosure_content ?? ''),
  }
}

function ensureSentenceEnd(s: string): string {
  const trimmed = String(s || '').trim()
  if (!trimmed) return ''
  if (/[.!?]$/.test(trimmed)) return trimmed
  return `${trimmed}.`
}

function normalizeMarkdown(raw: string, fallbackTitle: string): string {
  let t = String(raw || '').replace(/\r\n/g, '\n').trim()
  if (!t) return `# ${fallbackTitle}\n`

  t = t.replace(/\n{3,}/g, '\n\n')
  const lines = t.split('\n').map((line) => line.trimEnd())
  let firstH1Seen = false
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (!line) continue
    if (/^#\s+/.test(line)) {
      if (!firstH1Seen) {
        firstH1Seen = true
      } else {
        lines[i] = line.replace(/^#\s+/, '## ')
      }
    }
  }
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0)
  if (firstContentIndex === -1) return `# ${fallbackTitle}\n`
  if (!/^#\s+/.test(lines[firstContentIndex].trim())) {
    lines.unshift(`# ${fallbackTitle}`, '')
  }
  let out = lines.join('\n')
  out = out.replace(/\n{3,}/g, '\n\n').trim()
  const paragraphs = out
    .split('\n\n')
    .map((block) => {
      const b = block.trim()
      if (!b) return ''
      if (/^#{1,6}\s+/.test(b)) return b
      if (/^(-|\*|\d+\.)\s+/.test(b)) return b
      return ensureSentenceEnd(b)
    })
    .filter(Boolean)
  return paragraphs.join('\n\n').trim()
}

/** n8n "Content Formatter" on the five fields. */
export function formatSitePagesBundleFields(
  input: Record<ContentKey, string>,
): Record<ContentKey, string> {
  const out: Record<ContentKey, string> = { ...input }
  for (const key of FIELD_KEYS) {
    out[key] = normalizeMarkdown(input[key] ?? '', TITLES[key])
  }
  return out
}
