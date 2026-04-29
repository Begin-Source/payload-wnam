/**
 * Strip Payload's default product suffix from the admin document title, then append
 * ` | {brandName}`. Idempotent when the title already ends with that suffix.
 *
 * Browser tab titles are ultimately owned by `AdminBrandingEffects` after branding fetch;
 * optional `admin.meta` in payload.config does not replace this client-side pass.
 *
 * Separator before "Payload" may be ASCII `-`, en/em dash, fullwidth `－`, `｜`, etc.
 */
const SEP_BEFORE_PAYLOAD = String.raw`[\-\u2010-\u2015\u2212\uFF0D\uFF5C|｜]`
const PAYLOAD_TITLE_SUFFIX = new RegExp(
  String.raw`\s*${SEP_BEFORE_PAYLOAD}\s*Payload(\s+CMS)?\s*$`,
  'iu',
)
/** Title is only the default product name (no page segment). */
const ONLY_PAYLOAD = /^Payload(\s+CMS)?\s*$/i

/**
 * Remove trailing `… - Payload` / `Payload CMS` without appending a brand.
 * If the whole title is only the product name, returns an empty string.
 */
export function stripPayloadProductSuffix(raw: string): string {
  const t = raw.trim()
  if (ONLY_PAYLOAD.test(t)) return ''
  return t.replace(PAYLOAD_TITLE_SUFFIX, '').trim()
}

export function formatBrandDocumentTitle(raw: string, brandName: string): string {
  const brand = brandName.trim()
  if (!brand) return raw

  const t = raw.trim()
  const brandedSuffix = ` | ${brand}`
  if (t.endsWith(brandedSuffix)) return raw

  if (ONLY_PAYLOAD.test(t)) return brand

  const stripped = stripPayloadProductSuffix(t)
  if (!stripped) return brand
  return `${stripped}${brandedSuffix}`
}
