export type SeoTitleCandidate = {
  id: string
  title: string
  description: string
  formula: 'year_guide' | 'buying_guide' | 'how_to'
  characterCount: number
}

export type SeoTitleInput = {
  keyword: string
  fallbackTitle?: string
  year?: number
}

function cleanWords(value: string): string[] {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s&]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

export function normalizeSeoKeyword(input: SeoTitleInput): string {
  const raw = input.keyword.trim() || input.fallbackTitle?.trim() || 'Article'
  return cleanWords(raw).join(' ').toLowerCase()
}

function titleCase(value: string): string {
  const keepUpper = new Set(['seo', 'ai', 'crm', 'api', 'faq', 'hiit', 'usb'])
  return cleanWords(value)
    .map((word) => {
      const lower = word.toLowerCase()
      if (keepUpper.has(lower)) return lower.toUpperCase()
      if (word === '&') return word
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`
    })
    .join(' ')
}

function truncateAtWord(value: string, maxChars: number): string {
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length <= maxChars) return text
  const cut = text.slice(0, maxChars + 1)
  const ix = cut.lastIndexOf(' ')
  return (ix > 30 ? cut.slice(0, ix) : text.slice(0, maxChars)).replace(/[,:;&-]\s*$/, '').trim()
}

function metaDescription(keyword: string, year: number): string {
  return truncateAtWord(
    `Choose the right ${keyword} in ${year} with clear guidance on features, sizing, materials, safety, durability, and cost per use.`,
    155,
  )
}

function candidate(id: string, title: string, description: string, formula: SeoTitleCandidate['formula']): SeoTitleCandidate {
  return {
    id,
    title: truncateAtWord(title, 60),
    description,
    formula,
    characterCount: truncateAtWord(title, 60).length,
  }
}

export function writeSeoTitleCandidates(input: SeoTitleInput): SeoTitleCandidate[] {
  const year = input.year ?? new Date().getFullYear()
  const keyword = normalizeSeoKeyword(input)
  const kwTitle = titleCase(keyword)
  const desc = metaDescription(keyword, year)
  return [
    candidate('a', `${kwTitle} Guide ${year}: What to Check Before Buying`, desc, 'year_guide'),
    candidate('b', `Best ${kwTitle}: Grip, Size, Safety & Value Guide`, desc, 'buying_guide'),
    candidate('c', `How to Choose a ${kwTitle}: ${year} Buying Checklist`, desc, 'how_to'),
  ]
}

function scoreTitle(title: string, keyword: string): number {
  const lower = title.toLowerCase()
  let score = 0
  if (lower.startsWith(keyword)) score += 30
  else if (lower.includes(keyword)) score += 18
  if (title.length >= 50 && title.length <= 60) score += 24
  else if (title.length >= 42 && title.length <= 65) score += 14
  if (/\b(guide|best|choose|checklist|buying)\b/i.test(title)) score += 14
  if (/\b20\d{2}\b/.test(title)) score += 8
  if (/[:&]/.test(title)) score += 4
  return score
}

export function pickSeoTitle(input: SeoTitleInput): SeoTitleCandidate {
  const keyword = normalizeSeoKeyword(input)
  const candidates = writeSeoTitleCandidates(input)
  return [...candidates].sort((a, b) => scoreTitle(b.title, keyword) - scoreTitle(a.title, keyword))[0] ?? candidates[0]!
}
