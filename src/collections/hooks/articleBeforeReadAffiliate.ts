import type { CollectionBeforeReadHook } from 'payload'

/** Matches common Amazon / Associates URL patterns in Lexical link `url` or serialized JSON. */
const AFFILIATE_RE = /amazon\.(com|co\.jp|de|uk|ca|fr|es|it|in)|amzn\.to|\/dp\/[A-Z0-9]{10}|\btag=[^&\s"']+/i

function bodyHasAffiliateLink(body: unknown): boolean {
  return typeof body === 'object' && body != null && AFFILIATE_RE.test(JSON.stringify(body))
}

function bodyHasDisclosure(body: unknown): boolean {
  const s = JSON.stringify(body)
  return (
    /Disclosure:\s*This site may earn commissions/i.test(s) ||
    /Amazon Associates/i.test(s) ||
    /联盟.*(声明|披露|免责)/i.test(s)
  )
}

function injectDisclosureParagraph(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body
  const b = body as { root?: { children?: unknown[]; type?: string } }
  const root = b.root
  if (!root || root.type !== 'root' || !Array.isArray(root.children)) return body

  const disclosure = {
    type: 'paragraph',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr',
    children: [
      {
        type: 'text',
        format: '',
        text: 'Disclosure: This site may earn commissions from qualifying purchases (e.g. Amazon Associates). ',
        version: 1,
        mode: 'normal',
        style: '',
        detail: 0,
      },
    ],
  }

  return {
    ...b,
    root: {
      ...root,
      children: [disclosure, ...root.children],
    },
  }
}

/**
 * EEAT 补丁 C：含联盟链接的正文在读出时自动在首段前插入 Disclosure（Admin / API 一致）。
 */
export const articleBeforeReadAffiliate: CollectionBeforeReadHook = ({ doc }) => {
  if (!doc || typeof doc !== 'object') return
  const d = doc as { body?: unknown }
  if (!d.body || !bodyHasAffiliateLink(d.body) || bodyHasDisclosure(d.body)) return
  d.body = injectDisclosureParagraph(d.body)
}
