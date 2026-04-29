import type { Category, Offer } from '@/payload-types'

function categoryIdsFromOffer(offer: Offer): number[] {
  const raw = offer.categories
  if (!raw || !Array.isArray(raw)) return []
  const ids: number[] = []
  for (const x of raw) {
    if (typeof x === 'number') ids.push(x)
    else if (typeof x === 'object' && x !== null && typeof (x as { id?: unknown }).id === 'number') {
      ids.push((x as { id: number }).id)
    }
  }
  return ids
}

/**
 * Active offers per category slug for AMZ `/products` browse UI.
 * Multi-category offers increment each listed category's count.
 */
export function buildProductCountBySlug(categories: Category[], offers: Offer[]): Record<string, number> {
  const byId = new Map<number, number>()
  for (const o of offers) {
    for (const id of categoryIdsFromOffer(o)) {
      byId.set(id, (byId.get(id) ?? 0) + 1)
    }
  }
  const out: Record<string, number> = {}
  for (const c of categories) {
    const slug = (c.slug ?? String(c.id)).trim()
    out[slug] = byId.get(c.id) ?? 0
  }
  return out
}
