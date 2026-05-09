/** Collapse whitespace and decorative quotes so CMS title matches duplicate body heading. */
function normalizeTitleForDedupe(s: string): string {
  return s
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\u201c\u201d\u2018\u2019"""''`]/g, '')
    .trim()
    .toLowerCase()
}

/**
 * Strip HTML tags and decode the handful of entities Lexical emits in <h1> bodies.
 * Adequate for title-equivalence checks; not a general-purpose HTML sanitizer.
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
}

const LEADING_H1 = /^\s*<h1\b[^>]*>([\s\S]*?)<\/h1>\s*/i
const PAYLOAD_RICHTEXT_OPEN = /^\s*(<(?:div|section|article|main)\b[^>]*\bclass="[^"]*\bpayload-richtext\b[^"]*"[^>]*>)/i

/**
 * Drops the first top-level duplicate `<h1>` from Lexical HTML when it repeats the page title.
 * Parity with `amz-template-old` review pages: title lives in frontmatter, MDX body does not repeat it.
 *
 * Regex-based instead of jsdom to keep the Cloudflare Worker bundle small (jsdom + cssstyle +
 * mdn-data + tr46 + parse5 ≈ 1.5 MiB minified). The HTML we get from Lexical's serializer is
 * predictable enough that string matching is safe here.
 */
export function stripLeadingDuplicateH1FromArticleHtml(html: string, pageTitle: string): string {
  const trimmed = html.trim()
  if (!trimmed || !pageTitle?.trim()) return html

  const target = normalizeTitleForDedupe(pageTitle)
  if (!target) return html

  const wrapperMatch = trimmed.match(PAYLOAD_RICHTEXT_OPEN)
  if (wrapperMatch) {
    const wrapperOpen = wrapperMatch[1]
    const inner = trimmed.slice(wrapperOpen.length)
    const closingTag = `</${wrapperOpen.match(/^<(\w+)/i)?.[1] ?? 'div'}>`
    const closingIndex = inner.lastIndexOf(closingTag)
    if (closingIndex < 0) return html

    const innerHtml = inner.slice(0, closingIndex)
    const tail = inner.slice(closingIndex)
    const stripped = stripLeadingH1IfMatches(innerHtml, target)
    if (stripped === innerHtml) return html
    return `${wrapperOpen}${stripped}${tail}`.trim()
  }

  const stripped = stripLeadingH1IfMatches(trimmed, target)
  return stripped === trimmed ? html : stripped.trim()
}

function stripLeadingH1IfMatches(html: string, normalizedTarget: string): string {
  const m = html.match(LEADING_H1)
  if (!m) return html
  const headingText = htmlToPlainText(m[1] ?? '')
  if (normalizeTitleForDedupe(headingText) !== normalizedTarget) return html
  return html.slice(m[0].length)
}
