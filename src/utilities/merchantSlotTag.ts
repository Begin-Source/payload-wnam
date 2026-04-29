/** Stable tag for DataForSEO task `tag` (max 255). */
export function formatMerchantSlotTag(categoryId: number, batchUuid: string): string {
  return `payload:category:${categoryId}:${batchUuid}`
}

const TAG_RE = /^payload:category:(\d+):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

export function parseMerchantSlotTag(tag: string): {
  categoryId: number
  batchUuid: string
} | null {
  const t = String(tag ?? '').trim()
  const m = TAG_RE.exec(t)
  if (!m) return null
  return { categoryId: Number(m[1]), batchUuid: m[2] }
}
