import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Source-data generation only: no application build or deployment artifacts.
const require = createRequire(import.meta.url)
const root = path.dirname(require.resolve('lucide-react/package.json'))
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const exports = readFileSync(path.join(root, 'dist/esm/lucide-react.mjs'), 'utf8')
const aliases = {}
const nodes = {}
for (const match of exports.matchAll(/export \{ ([^}]+) \} from '\.\/icons\/([^']+)';/g)) {
  const file = path.join(root, 'dist/esm/icons', match[2])
  const source = readFileSync(file, 'utf8')
  const iconName = source.match(/createLucideIcon\(\s*"([^"]+)"/)?.[1]
  assert.ok(iconName, `Missing canonical icon name in ${match[2]}`)
  const { __iconNode } = await import(pathToFileURL(file).href)
  assert.ok(Array.isArray(__iconNode), `Missing icon data in ${match[2]}`)
  nodes[iconName] = JSON.stringify(__iconNode)
  for (const name of match[1].split(', ')) {
    assert.match(name, /^default as \w+$/)
    aliases[name.slice('default as '.length)] = iconName
  }
}
assert.ok(Object.keys(nodes).length > 1000, 'Unexpectedly incomplete Lucide catalog')
const catalog = JSON.stringify({ version: pkg.version, aliases, nodes }) + '\n'
const target = 'src/utilities/lucideIconCatalog.json'
if (process.argv.includes('--check')) {
  assert.equal(readFileSync(target, 'utf8'), catalog, 'Regenerate the Lucide catalog after dependency changes')
} else {
  writeFileSync(target, catalog)
  writeFileSync('src/utilities/lucideIconCatalog.LICENSE', readFileSync(path.join(root, 'LICENSE')))
}
console.log(`Lucide ${pkg.version}: ${Object.keys(nodes).length} icons, ${Object.keys(aliases).length} names`)
