import { lexicalArticleBodyToPlainText } from '@/services/writing/lexicalBodyPlain'

/**
 * Markdown-oriented publish smoke score (0–100). Expects `##` headings when content was authored as MD.
 * Not a substitute for the CORE-EEAT 80-item skill audit.
 */
export function scoreArticleMarkdownPublishHeuristic(md: string): number {
  const t = md.trim()
  if (!t) return 0
  const lower = t.toLowerCase()
  if (/\blorem ipsum\b/.test(lower)) return 0

  const words = t.split(/\s+/).filter(Boolean).length
  const h2 = (t.match(/^##\s+/gm) ?? []).length
  const h3 = (t.match(/^###\s+/gm) ?? []).length
  const hasList = /(^|\n)\s*[-*]\s+\S/m.test(t) || /(^|\n)\s*\d+\.\s+\S/m.test(t)
  const hasLink = /\]\([^)]+\)/.test(t) || /https?:\/\/\S+/.test(t)
  const paras = t.split(/\n\n+/).filter((p) => p.trim().length > 40).length
  const hasDisclosure =
    /affiliate|commission|disclosure|we may earn|partner links/i.test(t) ||
    /联盟|推广链接|声明|佣金/i.test(t)
  const hasFaq = /^##\s+faq\b/gim.test(t) || /\bQ\s*:\s+/i.test(t)

  let s = 0
  if (/^#\s+\S/m.test(t)) s += 8
  if (h2 >= 3) s += 14
  else if (h2 >= 2) s += 9
  if (h3 >= 1) s += 6
  if (words >= 1200) s += 22
  else if (words >= 800) s += 18
  else if (words >= 500) s += 14
  else if (words >= 300) s += 8
  if (hasList) s += 10
  if (hasLink) s += 10
  if (paras >= 5) s += 10
  else if (paras >= 3) s += 6
  if (hasDisclosure) s += 10
  if (hasFaq) s += 10
  return Math.min(100, Math.round(s))
}

/**
 * For Lexical `article.body` exports via {@link lexicalArticleBodyToPlainText} (no `#` headings preserved).
 */
export function scorePublishReadyPlainText(plain: string): number {
  const t = plain.trim()
  if (!t) return 0
  const lower = t.toLowerCase()
  if (/\blorem ipsum\b/.test(lower)) return 0

  const words = t.split(/\s+/).filter(Boolean).length
  const blocks = t.split(/\n\n+/).map((b) => b.trim()).filter((b) => b.length > 50)
  const bulletLines = t.split('\n').filter((line) => /^\s*-\s+\S/.test(line)).length
  const hasLink = /https?:\/\/\S+/.test(t)
  const hasDisclosure =
    /affiliate|commission|disclosure|we may earn|partner links/i.test(t) ||
    /联盟|推广链接|声明|佣金/i.test(t)
  const hasFaq = /\bfaq\b/i.test(t) || /\bQ\s*:/i.test(t)

  let s = 0
  if (words >= 1400) s += 28
  else if (words >= 1000) s += 24
  else if (words >= 700) s += 20
  else if (words >= 500) s += 16
  else if (words >= 350) s += 12
  else if (words >= 200) s += 6

  if (blocks.length >= 8) s += 22
  else if (blocks.length >= 6) s += 18
  else if (blocks.length >= 4) s += 14
  else if (blocks.length >= 2) s += 8

  if (bulletLines >= 6) s += 14
  else if (bulletLines >= 3) s += 10
  else if (bulletLines >= 1) s += 5

  if (hasLink) s += 10
  if (hasDisclosure) s += 10
  if (hasFaq) s += 8

  return Math.min(100, Math.round(s))
}

/** Score Payload article `body` (Lexical) after pipeline finalize. */
export function scoreArticleBodyPublishHeuristic(body: unknown): number {
  const plain = lexicalArticleBodyToPlainText(body)
  return scorePublishReadyPlainText(plain)
}
