// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as original from 'lucide-react'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import catalog from '../../src/utilities/lucideIconCatalog.json'
import { resolveLucideIcon } from '../../src/utilities/resolveLucideIcon'

describe('on-demand configured Lucide icons', () => {
  it('retains every icon export and alias from the installed library', () => {
    const require = createRequire(import.meta.url)
    const pkg = JSON.parse(readFileSync(require.resolve('lucide-react/package.json'), 'utf8'))
    expect(catalog.version).toBe(pkg.version)
    const icons = Object.entries(original).filter(([name, value]) =>
      name !== 'Icon' && value && typeof value === 'object' && 'render' in value,
    )
    expect(Object.keys(catalog.aliases).sort()).toEqual(icons.map(([name]) => name).sort())
    const checked = new Set<string>()
    for (const [name, component] of icons) {
      const canonical = (catalog.aliases as Record<string, string>)[name]
      const resolved = resolveLucideIcon(name)
      expect(resolved, name).toBeDefined()
      if (checked.has(canonical)) continue
      checked.add(canonical)
      const props = { className: 'h-6 w-6 test', size: 32, strokeWidth: 1.5, absoluteStrokeWidth: true, 'aria-label': name }
      expect(renderToStaticMarkup(createElement(resolved!, props)), name).toBe(
        renderToStaticMarkup(createElement(component as original.LucideIcon, props)),
      )
    }
  })

  it('reuses canonical components across aliases and rejects unknown/prototype names', () => {
    expect(resolveLucideIcon('Fingerprint')).toBe(resolveLucideIcon('FingerprintPattern'))
    expect(resolveLucideIcon('Fingerprint')).toBe(resolveLucideIcon('LucideFingerprint'))
    for (const name of ['missing-icon', '__proto__', 'constructor', 'toString', '']) {
      expect(resolveLucideIcon(name)).toBeUndefined()
    }
  })
})
