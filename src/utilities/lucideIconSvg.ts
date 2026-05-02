/** Lucide per-icon SVG path nodes (subset of `@lucide/lucide`'s IconNode tuple list). */
export type LucideSvgElement =
  | 'circle'
  | 'ellipse'
  | 'g'
  | 'line'
  | 'path'
  | 'polygon'
  | 'polyline'
  | 'rect'

export type IconNode = [LucideSvgElement, Record<string, string>][]

function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

export function sanitizePascalLucideIconName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s || !/^[A-Z][a-zA-Z0-9]*$/.test(s)) return null
  return s
}

/** PascalCase Lucide export name → kebab-case file key (`dynamicIconImports`). */
export function pascalIconNameToKebabFile(iconPascal: string): string {
  return iconPascal.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function attrsToSvgString(attrs: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'key') continue
    if (typeof v !== 'string' && typeof v !== 'number') continue
    parts.push(`${k}="${escapeXmlAttr(String(v))}"`)
  }
  return parts.join(' ')
}

/**
 * Stable standalone SVG favicon body from a Lucide `__iconNode` (no React `key`).
 * Stroke defaults match lucide-react header marks (24 viewBox).
 */
export function iconNodeToSvgXml(
  node: IconNode,
  options?: {
    stroke?: string
    size?: number
  },
): string {
  const stroke = options?.stroke ?? '#09090b'
  const size = options?.size ?? 32
  const inner = node
    .map(([el, attrs]) => {
      const attrStr = attrsToSvgString(attrs)
      return `<${el}${attrStr ? ` ${attrStr}` : ''} />`
    })
    .join('')
  const strokeAttr = escapeXmlAttr(stroke)
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${strokeAttr}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,
    inner,
    `</svg>`,
  ].join('')
}

async function fallbackImageIconNode(): Promise<IconNode> {
    const imports = (
      await import('lucide-react/dynamicIconImports' /* webpackChunkName: "lucide-dynamic" */)
    ).default as Record<string, () => Promise<{ __iconNode?: IconNode }>>
    const loader = imports['image']
  if (!loader) {
    return [
      [
        'circle',
        { cx: '12', cy: '12', r: '10', key: '_' },
      ],
    ]
  }
  const mod = await loader()
  const n = mod.__iconNode
  return Array.isArray(n) && n.length > 0 ? (n as IconNode) : []
}

/**
 * Load Lucide icon path tuples by PascalCase React name (`ShoppingBag`).
 * Restricted identifiers + whitelist via `dynamicIconImports` keys; fallback `Image`.
 */
export async function loadLucideIconNode(iconPascal: string): Promise<IconNode> {
  const safe = sanitizePascalLucideIconName(iconPascal)
  if (!safe) return fallbackImageIconNode()
  const kebab = pascalIconNameToKebabFile(safe)
  try {
    const imports = (
      await import('lucide-react/dynamicIconImports' /* webpackChunkName: "lucide-dynamic" */)
    ).default as Record<string, () => Promise<{ __iconNode?: IconNode }>>
    const loader = imports[kebab]
    if (typeof loader !== 'function') {
      return fallbackImageIconNode()
    }
    const mod = await loader()
    const n = mod.__iconNode
    return Array.isArray(n) && n.length > 0 ? (n as IconNode) : fallbackImageIconNode()
  } catch {
    return fallbackImageIconNode()
  }
}

export async function lucideSvgFaviconMarkupForPascalIcon(iconPascal: string): Promise<string> {
  const node = await loadLucideIconNode(iconPascal)
  return iconNodeToSvgXml(node)
}

/** Absolute URL for metadata `icons` (path always `/api/public/site-brand-icon` on canonical origin). */
export function lucideBrandIconAbsoluteUrl(canonicalSiteUrl: string): string | null {
  const u = canonicalSiteUrl.trim()
  if (!u) return null
  try {
    let href = u
    if (!/^https?:\/\//i.test(href)) {
      href = `https://${href}`
    }
    const parsed = new URL(href)
    return new URL('/api/public/site-brand-icon', parsed.origin).href
  } catch {
    return null
  }
}
