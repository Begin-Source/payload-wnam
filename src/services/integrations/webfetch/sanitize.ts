/**
 * Strip untrusted patterns before sending scraped HTML to an LLM (data, not instruction).
 */
export function sanitizeHtmlToTextForLlm(input: string): string {
  let s = input
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '')
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(/<meta[\s\S]*?>/gi, '')
  s = s.replace(/<[^>]+>/g, ' ')
  s = s.replace(/\b(ignore (previous|rules)|override system|pre-approved by owner)\b/gi, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s.slice(0, 50_000)
}
