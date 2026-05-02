import type { AmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'

/** Lucide export names to replace with niche heuristics (defaults + generics). */
const PLACEHOLDER_LUCIDE_ICONS = new Set(['Image', 'Globe', 'Circle', 'Box'])

/** “导航式”Lucide — 若域名短语已收窄垂直领域则优先用 niche 启发式。 */
const GENERIC_NAV_LUCIDE = new Set(['Home', 'House'])

const DEFAULT_VERTICAL_ICON = 'ShoppingBag'

type NicheRule = { patterns: RegExp[]; icon: string }

/** Order: first regex match wins. PascalCase lucide-react component names. */
const NICHE_RULES: NicheRule[] = [
  {
    patterns: [/\byoga\b/i, /\bpilates\b/i, /\bmeditation\b/i, /\bmindfulness\b/i],
    icon: 'Activity',
  },
  {
    patterns: [/\bgym\b/i, /\bworkout\b/i, /\bfitness\b/i, /\bdumbbell\b/i, /\bstrength\b/i],
    icon: 'Dumbbell',
  },
  {
    patterns: [/\bkitchen\b/i, /\bcook\b/i, /\bcookware\b/i, /\brecipe\b/i, /\bulinary\b/i, /\bbeef\b/i],
    icon: 'ChefHat',
  },
  {
    patterns: [
      /\bcoffee\b/i,
      /\btea\b/i,
      /\bespresso\b/i,
      /\bbev(erage|rages)?\b/i,
      /\bjuice\b/i,
      /\bsmoothie\b/i,
    ],
    icon: 'CupSoda',
  },
  {
    patterns: [/\bwine\b/i, /\bvineyard\b/i, /\bcellar\b/i],
    icon: 'Wine',
  },
  {
    patterns: [/\bdog\b/i, /\bcat\b/i, /\bpet\b/i, /\bpuppy\b/i, /\bfeline\b/i, /\bcanine\b/i],
    icon: 'PawPrint',
  },
  {
    patterns: [/\bgarden\b/i, /\bplant\b/i, /\blawn\b/i, /\bgrass\b/i, /\boutdoor\s+living\b/i],
    icon: 'Leaf',
  },
  {
    patterns: [/\bbook\b/i, /\breading\b/i, /\be-?book\b/i, /\blibrary\b/i],
    icon: 'BookOpen',
  },
  {
    patterns: [/\breviews?\b/i, /\bguide(s)?\s+site\b/i],
    icon: 'BookOpen',
  },
  {
    patterns: [
      /\bhiking\b/i,
      /\bcamp(ing)?\b/i,
      /\btrail\b(?!\w)/i,
      /\bbackpack\b/i,
      /\btent\b/i,
    ],
    icon: 'Tent',
  },
  {
    patterns: [
      /\bheadphones?\b/i,
      /\baudio\b/i,
      /\bhi-?fi\b/i,
      /\bspeaker(s)?\b/i,
      /\bsound\b(?!\w)/i,
    ],
    icon: 'Headphones',
  },
  {
    patterns: [
      /\bgaming\b/i,
      /\bconsole\b/i,
      /\bplaystation\b/i,
      /\bxbox\b/i,
      /\besports\b/i,
    ],
    icon: 'Gamepad2',
  },
  {
    patterns: [
      /\blaptop\b/i,
      /\bcomputer\b/i,
      /\bssd\b/i,
      /\bmotherboard\b/i,
    ],
    icon: 'Laptop',
  },
  {
    patterns: [
      /\bsmartphone\b/i,
      /\biphone\b/i,
      /\bmobile\b/i,
      /\bphone\b(?!\s*case)/i,
      /\bandroid\b(?!\s+studio)/i,
    ],
    icon: 'Smartphone',
  },
  {
    patterns: [/\bcamera\b/i, /\bdslr\b/i, /\bphotograph(y|er)?\b/i],
    icon: 'Camera',
  },
  {
    patterns: [/mattress\b/i, /\bsheets?\b/i, /\bbed(room)?\b/i, /\bsleep\b/i, /\bbing\b/i],
    icon: 'Bed',
  },
  {
    patterns: [/\bcar\b/i, /\bauto\b/i, /\bautomotive\b/i, /\bvehicle\b/i, /\bmotor\b/i, /\bsuv\b/i],
    icon: 'Car',
  },
  {
    patterns: [
      /\b(bicycle|electric\s+bike|mtb|cycling|cyclist)\b/i,
      /\broad\s+bike\b/i,
    ],
    icon: 'Bike',
  },
  {
    patterns: [/\bsports?\b/i],
    icon: 'Activity',
  },
  {
    patterns: [/yoga\s+mat\b/i, /\bfitness\s+mat\b/i],
    icon: 'Activity',
  },
]

const MAX_DOMAIN_HINT_PHRASES = 10

/**
 * Known English segments inside compound domains (longest-first greedy peel from left).
 * Keep in sync-ish with NICHE_RULES vocabulary; extend as needed.
 */
const DOMAIN_LABEL_SEGMENTS: string[] = [
  'mindfulness',
  'meditation',
  'pilates',
  'photography',
  'automotive',
  'electronics',
  'smartphone',
  'headphones',
  'kitchenware',
  'cookware',
  'wine',
  'garden',
  'fitness',
  'workout',
  'reviews',
  'checklist',
  'espresso',
  'shopping',
  'outdoor',
  'cycling',
  'backpack',
  'mattress',
  'kitchen',
  'culinary',
  'recipe',
  'coffee',
  'smoothie',
  'beverage',
  'yoga',
  'guides',
  'guide',
  'review',
  'reviews',
  'mats',
  'mat',
  'gym',
  'laptop',
  'camera',
  'gaming',
  'mobile',
  'iphone',
  'android',
  'tablet',
  'speaker',
  'phone',
  'books',
  'ebook',
  'library',
  'hiking',
  'camping',
  'trail',
  'tent',
  'sport',
  'sports',
].filter((value, idx, arr) => arr.indexOf(value) === idx)

const DOMAIN_SEGMENT_BY_LENGTH_DESC = [...DOMAIN_LABEL_SEGMENTS].sort(
  (a, b) => b.length - a.length,
)

/** Secondary phrases when a peeled token implies “guide/review content”. */
function expandGuideLikeTokens(tokens: readonly string[]): string[] {
  if (!tokens.some((t) => t === 'guide' || t === 'guides' || t === 'review' || t === 'reviews')) {
    return []
  }
  return ['guide site', 'reviews', 'checklist', 'book']
}

/** Extra breadth for obvious wellness domains. */
function expandWellnessTokens(tokens: readonly string[]): string[] {
  if (
    !tokens.some((t) =>
      ['yoga', 'pilates', 'mat', 'mats', 'meditation', 'mindfulness', 'fitness', 'workout', 'gym'].includes(t),
    )
  ) {
    return []
  }
  return ['sport']
}

function tokenizeDomainLabel(labelNorm: string): string[] {
  const tokens: string[] = []
  let rest = labelNorm
  outer: while (rest.length > 0) {
    for (const seg of DOMAIN_SEGMENT_BY_LENGTH_DESC) {
      if (rest.startsWith(seg)) {
        tokens.push(seg)
        rest = rest.slice(seg.length)
        continue outer
      }
    }
    rest = rest.slice(1)
  }
  return tokens
}

function pushUniquePhrases(bucket: string[], phrase: string): void {
  const t = phrase.trim().toLowerCase()
  if (t.length < 2 || bucket.some((existing) => existing.toLowerCase() === t)) return
  bucket.push(t)
}

/**
 * Up to MAX_DOMAIN_HINT_PHRASES search strings derived from hostname / primary domain label,
 * most specific compounds first — first NICHE_RULES hit wins in suggest*.
 */
export function buildDomainLucideHints(primaryDomainOrHost: string | null | undefined): string[] {
  if (typeof primaryDomainOrHost !== 'string') return []

  let host = primaryDomainOrHost
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[#?].*$/, '')
    .split('/')[0] ?? ''

  host = host.split(':')[0] ?? ''
  if (!host || host === 'localhost' || host.endsWith('.local')) return []

  const firstLabel = host.split('.')[0] ?? ''
  const labelNorm = firstLabel.replace(/[^a-z0-9]/g, '')
  if (labelNorm.length < 3) return []

  const tokens = tokenizeDomainLabel(labelNorm)
  if (!tokens.length) return []

  const phrases: string[] = []

  for (let end = tokens.length; end >= 2; end--) {
    pushUniquePhrases(phrases, tokens.slice(0, end).join(' '))
  }
  if (tokens.length === 1) {
    pushUniquePhrases(phrases, tokens[0]!)
  } else {
    for (const t of tokens) {
      pushUniquePhrases(phrases, t)
    }
  }

  for (const expand of [...expandGuideLikeTokens(tokens), ...expandWellnessTokens(tokens)]) {
    pushUniquePhrases(phrases, expand)
  }

  return phrases.slice(0, MAX_DOMAIN_HINT_PHRASES)
}

/** Same token peel + phrase ordering as hostname hints, but for `sites.slug` (localhost `?site=` dev). */
export function buildSiteSlugLucideHints(slug: string | null | undefined): string[] {
  if (typeof slug !== 'string') return []
  const raw = slug.trim().toLowerCase()
  if (raw.length < 2) return []
  let parts = raw.split(/[.\-+_]+/).filter(Boolean)
  if (
    parts.length >= 2 &&
    ['com', 'org', 'net', 'io', 'co', 'app', 'dev'].includes(parts[parts.length - 1]!)
  ) {
    parts = parts.slice(0, -1)
  }
  const labelNorm = parts.join('')
  if (labelNorm.length < 3) return []

  const tokens = tokenizeDomainLabel(labelNorm)
  if (!tokens.length) return []

  const phrases: string[] = []

  for (let end = tokens.length; end >= 2; end--) {
    pushUniquePhrases(phrases, tokens.slice(0, end).join(' '))
  }
  if (tokens.length === 1) {
    pushUniquePhrases(phrases, tokens[0]!)
  } else {
    for (const t of tokens) {
      pushUniquePhrases(phrases, t)
    }
  }

  for (const expand of [...expandGuideLikeTokens(tokens), ...expandWellnessTokens(tokens)]) {
    pushUniquePhrases(phrases, expand)
  }

  return phrases.slice(0, MAX_DOMAIN_HINT_PHRASES)
}

function iconFromHay(hayLower: string): string | undefined {
  for (const rule of NICHE_RULES) {
    for (const rx of rule.patterns) {
      rx.lastIndex = 0
      if (rx.test(hayLower)) return rule.icon
    }
  }
  return undefined
}

export function flattenNicheText(
  mainProduct: string | null | undefined,
  nicheData: unknown,
): string {
  const mp = typeof mainProduct === 'string' ? mainProduct : ''
  let nd = ''
  if (nicheData != null && typeof nicheData === 'object' && !Array.isArray(nicheData)) {
    try {
      nd = JSON.stringify(nicheData)
    } catch {
      nd = ''
    }
  } else if (typeof nicheData === 'string') {
    nd = nicheData
  }
  return `${mp}\n${nd}`.toLowerCase()
}

/** Pick PascalCase lucide-react icon export from niche + main product hints. */
export function suggestLucideLogoIconFromNiche(
  mainProduct: string | null | undefined,
  nicheData: unknown,
  primaryDomain?: string | null,
  siteSlug?: string | null,
): string {
  const domainHints = buildDomainLucideHints(primaryDomain)
  for (const phrase of domainHints) {
    const hit = iconFromHay(phrase)
    if (hit) return hit
  }

  const slugHints = buildSiteSlugLucideHints(siteSlug)
  for (const phrase of slugHints) {
    const hit = iconFromHay(phrase)
    if (hit) return hit
  }

  const hay = flattenNicheText(mainProduct, nicheData)
  const fallback = iconFromHay(hay)
  return fallback ?? DEFAULT_VERTICAL_ICON
}

function isValidPascalLucideName(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name)
}

/** Empty, invalid PascalCase, or generic placeholder icons from the AI — replace with heuristic. */
export function shouldCoerceLucideBrandIcon(aiIcon: unknown): boolean {
  if (aiIcon == null) return true
  if (typeof aiIcon !== 'string') return true
  const t = aiIcon.trim()
  if (!t) return true
  if (!isValidPascalLucideName(t)) return true
  if (PLACEHOLDER_LUCIDE_ICONS.has(t)) return true
  return false
}

/**
 * After AMZ AI merge: align brand.logo lucide+favicon unless a raster URL is authoritative.
 */
export function coerceBrandLogoLucideForNiche(
  cfg: AmzSiteConfig,
  mainProduct: string | null | undefined,
  nicheData: unknown,
  primaryDomain?: string | null,
  siteSlug?: string | null,
): void {
  if (!cfg.brand || typeof cfg.brand !== 'object') return

  const suggested = suggestLucideLogoIconFromNiche(
    mainProduct,
    nicheData,
    primaryDomain,
    siteSlug,
  )
  /** Domain-derived hint phrases yielded at least one NICHE_RULES hit. */
  const domainBacked =
    !!primaryDomain &&
    buildDomainLucideHints(primaryDomain).some((phrase) => iconFromHay(phrase) !== undefined)

  if (
    cfg.brand.logo == null ||
    typeof cfg.brand.logo !== 'object' ||
    Array.isArray(cfg.brand.logo)
  ) {
    cfg.brand.logo = {
      type: 'lucide',
      icon: suggested,
      svgPath: '',
      imagePath: '',
    }
    return
  }

  const logo = cfg.brand.logo as Record<string, unknown>

  const typeRaw = logo.type as string | undefined
  const imagePath =
    typeof logo.imagePath === 'string' ? logo.imagePath.trim() : String(logo.imagePath ?? '').trim()

  if (typeRaw === 'image' && imagePath) {
    return
  }

  const aiIconRaw = logo.icon as unknown
  const ai = typeof aiIconRaw === 'string' ? aiIconRaw.trim() : ''
  const useHeuristicInsteadOfAiIcon =
    shouldCoerceLucideBrandIcon(aiIconRaw) ||
    (GENERIC_NAV_LUCIDE.has(ai) && domainBacked && suggested !== DEFAULT_VERTICAL_ICON)

  const nextIcon = useHeuristicInsteadOfAiIcon ? suggested : ai

  cfg.brand.logo = {
    ...cfg.brand.logo,
    type: 'lucide',
    icon: nextIcon,
    svgPath: '',
    imagePath: '',
  }
}
