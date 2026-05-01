import { JSDOM } from 'jsdom'

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
 * Drops the first top-level duplicate `<h1>` from Lexical HTML when it repeats the page title.
 * Parity with `amz-template-old` review pages: title lives in frontmatter, MDX body does not repeat it.
 */
export function stripLeadingDuplicateH1FromArticleHtml(html: string, pageTitle: string): string {
  const trimmed = html.trim()
  if (!trimmed || !pageTitle?.trim()) return html

  const target = normalizeTitleForDedupe(pageTitle)
  if (!target) return html

  let doc: Document
  try {
    doc = new JSDOM(`<body>${trimmed}</body>`, { contentType: 'text/html' }).window.document
  } catch {
    return html
  }

  const body = doc.body
  const root = body?.firstElementChild
  if (!root) return html

  let candidate: Element | null = null
  if (root.tagName === 'H1') {
    candidate = root
  } else if (root.classList.contains('payload-richtext')) {
    const first = root.firstElementChild
    if (first?.tagName === 'H1') candidate = first
  }

  if (!candidate) return html

  const h1Norm = normalizeTitleForDedupe(candidate.textContent ?? '')
  if (h1Norm !== target) return html

  candidate.remove()
  return body.innerHTML.trim()
}
