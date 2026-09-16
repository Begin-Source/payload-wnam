import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { escapeBundleRegex } from './escape-bundle-regex.mjs'

// Use the exact compiler already pinned by Wrangler; no framework upgrades.
const require = createRequire(realpathSync('node_modules/wrangler/package.json'))
const { transform } = require('esbuild')

export async function encodeWorkerSource(source) {
  const result = escapeBundleRegex(source)
  if (result.remainingTokenTypes.template) {
    // A tagged template's raw text cannot be escaped directly. The compiler's
    // template lowering preserves cooked/raw values, call-site identity and
    // receiver semantics while expressing characters as ordinary JS strings.
    const transformed = await transform(result.code, {
      charset: 'ascii', format: 'esm', target: 'es2022',
      supported: { 'template-literal': false },
      legalComments: 'inline',
    })
    result.code = transformed.code
  }
  return result
}
