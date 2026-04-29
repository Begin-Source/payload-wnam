/** Ported from n8n "Build Categories" — deterministic 5 slot names from niche + related/accessory. */

import type { ReadyGateRow } from './gate'

export type CategoryDetail = { name: string; source: string }

export type BuildRowIn = {
  id: string | number
  site_id: number | null
  main_product: string
  short_main_product?: string
  scenario_related_products?: string[]
  scenario_support_products?: string[]
  scenario_accessory_products?: string[]
  ai_candidates_count?: number
  ai_selected_index?: number
}

export type BuildRowOut = BuildRowIn & {
  categories: string[]
  category_details: CategoryDetail[]
  category_sources: string[]
  skipped: boolean
}

const placeholderCategories = [
  'Product Category 1',
  'Product Category 2',
  'Product Category 3',
  'Product Category 4',
  'Product Category 5',
]

const accessoryPattern =
  /(accessor|replacement|spare|part|consumable|refill|filter|cartridge|pod|bag|liner|clean|cleaning|kit|case|sleeve|gasket|seal|brush\s*head|blade|battery|閰嶄欢|鏇挎崲|鑰楁潬)/i

function normalizeLabel(text: string): string {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasCJK(text: string): boolean {
  return /[\u3400-\u9FBF]/.test(text || '')
}

export function simplifyProductName(mainProduct: string): string {
  let base = normalizeLabel(mainProduct)
  if (!base) return ''

  base = base.replace(/[\(\[\{].*?[\)\]\}]/g, ' ')
  const primary = base.split(/[,/;|]+/)[0] || base
  base = normalizeLabel(primary)

  if (hasCJK(base)) {
    base = base
      .replace(/\d+(?:\.\d+)?\s*[a-zA-Z]{1,4}\b/g, ' ')
      .replace(/\b\d+\b/g, ' ')
  } else {
    base = base
      .replace(
        /\b(?:pack\s*of\s*\d+|\d+\s*pack|variety\s*pack|count|ct)\b/gi,
        ' ',
      )
      .replace(
        /\b\d+(?:\.\d+)?\s*(?:cup|cups|qt|quart|oz|ounce|ounces|inch|inches|in|l|liter|liters|ml|w|v|mah|function|functions|in-1|piece|pieces|pcs?)\b/gi,
        ' ',
      )
      .replace(/\b\d+h\b/gi, ' ')
      .replace(/\b\d+\b/g, ' ')

    const words = normalizeLabel(base).split(' ').filter(Boolean)
    if (words.length > 6) base = words.slice(0, 6).join(' ')
  }

  base = normalizeLabel(base.replace(/-+$/g, ''))
  if (!base) base = normalizeLabel((String(mainProduct || '').split(',')[0] || '').trim())
  return base
}

function isAlignedNiche(candidate: string, fallback: string): boolean {
  const c = normalizeLabel(candidate).toLowerCase()
  const f = normalizeLabel(fallback).toLowerCase()
  if (!c || !f) return false

  if (hasCJK(c) || hasCJK(f)) {
    let hit = 0
    for (const ch of f.replace(/\s+/g, '')) {
      if (c.includes(ch)) hit += 1
      if (hit >= 2) return true
    }
    return false
  }

  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'mini', 'smart', 'best', 'new'])
  const cTokens = c.split(/[^a-z0-9]+/).filter((t) => t && !stop.has(t))
  const fTokens = f.split(/[^a-z0-9]+/).filter((t) => t && !stop.has(t))
  if (!cTokens.length || !fTokens.length) return false
  return fTokens.some((t) => t.length >= 4 && cTokens.includes(t))
}

function uniqueNames(items: unknown[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of Array.isArray(items) ? items : []) {
    const name = normalizeLabel(String(raw))
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

function buildForRow(row: BuildRowIn): {
  niche: string
  categories: string[]
  category_details: CategoryDetail[]
} {
  const fallbackNiche = simplifyProductName(row.main_product)
  const aiNiche = normalizeLabel(row.short_main_product || '')
  const niche =
    aiNiche && isAlignedNiche(aiNiche, fallbackNiche) ? aiNiche : fallbackNiche

  if (!niche) {
    const placeholderDetails = placeholderCategories.map((name) => ({
      name,
      source: 'placeholder',
    }))
    return { niche: '', categories: [...placeholderCategories], category_details: placeholderDetails }
  }

  const rawRelatedCandidates = uniqueNames(
    row.scenario_related_products || row.scenario_support_products || [],
  ).filter((name) => name.toLowerCase() !== niche.toLowerCase())

  const related = rawRelatedCandidates.filter((name) => !accessoryPattern.test(name)).slice(0, 5)

  const relatedSet = new Set(related.map((name) => name.toLowerCase()))

  const relatedAccessorySpillover = rawRelatedCandidates.filter(
    (name) => accessoryPattern.test(name) && !relatedSet.has(name.toLowerCase()),
  )

  const accessoryRaw = uniqueNames([
    ...relatedAccessorySpillover,
    ...(Array.isArray(row.scenario_accessory_products) ? row.scenario_accessory_products : []),
  ]).filter(
    (name) =>
      name.toLowerCase() !== niche.toLowerCase() && !relatedSet.has(name.toLowerCase()),
  )

  const details: CategoryDetail[] = []

  for (const name of related) {
    if (details.length >= 5) break
    details.push({ name, source: 'related' })
  }

  for (const name of accessoryRaw) {
    if (details.length >= 5) break
    details.push({ name, source: 'fallback_accessory' })
  }

  if (!details.length) {
    const placeholderDetails = placeholderCategories.map((name) => ({
      name,
      source: 'placeholder',
    }))
    return { niche, categories: [...placeholderCategories], category_details: placeholderDetails }
  }

  while (details.length < 5) {
    const next =
      placeholderCategories[details.length] || `Product Category ${details.length + 1}`
    details.push({ name: next, source: 'placeholder' })
  }

  return {
    niche,
    categories: details.map((d) => d.name),
    category_details: details,
  }
}

export function normalizeReadyRows(readyRows: ReadyGateRow[]): BuildRowOut[] {
  return readyRows.map((row) => {
    const categories = Array.isArray(row.categories)
      ? row.categories.map((v) => normalizeLabel(String(v))).filter(Boolean).slice(0, 5)
      : []

    const details: CategoryDetail[] = categories.length
      ? categories.map((name) => ({ name, source: 'existing' }))
      : placeholderCategories.map((name) => ({ name, source: 'placeholder' }))

    const padded = [...details]
    while (padded.length < 5) {
      const next =
        placeholderCategories[padded.length] || `Product Category ${padded.length + 1}`
      padded.push({ name: next, source: 'placeholder' })
    }

    return {
      ...row,
      categories: padded.map((d) => d.name),
      category_details: padded,
      category_sources: padded.map((d) => d.source),
      skipped: true,
    }
  })
}

export function mergeBuildCategories(
  readyRowsNormalized: BuildRowOut[],
  inputRows: BuildRowIn[],
): BuildRowOut[] {
  const generatedRows: BuildRowOut[] = inputRows.map((row) => {
    const built = buildForRow(row)
    const fallbackNiche = simplifyProductName(row.main_product)

    return {
      ...row,
      short_main_product: built.niche || fallbackNiche,
      categories: built.categories,
      category_details: built.category_details,
      category_sources: built.category_details.map((d) => d.source),
      skipped: false,
      ai_candidates_count: row.ai_candidates_count ?? 0,
      ai_selected_index: row.ai_selected_index ?? -1,
    }
  })

  return [...readyRowsNormalized, ...generatedRows]
}
