import { createLucideIcon, type IconNode, type LucideIcon } from 'lucide-react'
import catalog from './lucideIconCatalog.json'

// Keep unused SVG trees encoded. A namespace import eagerly initializes the
// complete icon library in both server and client bundles. Only icons actually
// requested by site configuration need React components and parsed SVG nodes.
// Generated from the pinned library by scripts/generate-lucide-catalog.mjs;
// its ISC license is preserved in lucideIconCatalog.LICENSE.
const aliases: Readonly<Record<string, string>> = catalog.aliases
const nodes: Readonly<Record<string, string>> = catalog.nodes
const components = new Map<string, LucideIcon>()

export function resolveLucideIcon(name: string): LucideIcon | undefined {
  if (!Object.hasOwn(aliases, name)) return undefined
  const canonical = aliases[name]
  let component = components.get(canonical)
  if (!component) {
    component = createLucideIcon(canonical, JSON.parse(nodes[canonical]) as IconNode)
    components.set(canonical, component)
  }
  return component
}
