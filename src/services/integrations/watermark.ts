/**
 * Optional watermarking via Workers image resizing. Stub: return original when binding missing.
 */
export function needsWatermark(applyLogo: boolean): boolean {
  return applyLogo
}

export async function applyWatermarkToUrl(
  publicUrl: string,
  _opts: { siteSlug?: string },
): Promise<string> {
  // Integrate @cloudflare/workers-image-resizing if configured in production
  return publicUrl
}
