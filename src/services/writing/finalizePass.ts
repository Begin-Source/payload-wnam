/**
 * Post-pass: dedupe pronouns / internal link placeholders (stub).
 */
export function finalizeArticleBodyText(input: string): string {
  return input.replace(/\s+\n/g, '\n').trim()
}
