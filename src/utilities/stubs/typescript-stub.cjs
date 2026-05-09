/**
 * Cloudflare Workers stub for the `typescript` package.
 *
 * Next.js's server runtime contains conditional `require('typescript')` paths
 * (e.g. `next/dist/server/typescript`) which the build-time NFT tracer treats
 * as a hard dep, pulling the entire 6.3 MiB `typescript/lib/typescript.js`
 * compiler into every server route's bundle.
 *
 * Type checking and TS-aware features run at build time only (`pnpm build`
 * with `next.config.ts` `typescript.ignoreBuildErrors: true`). The Worker
 * runtime never needs the compiler. Aliasing `typescript` to this stub
 * removes the 6.3 MiB payload from `handler.mjs` without affecting builds.
 */
const noop = () => {}

const stub = new Proxy(
  {
    version: '0.0.0-stub',
    sys: undefined,
    createSourceFile: noop,
    forEachChild: noop,
    isIdentifier: () => false,
    SyntaxKind: {},
    ScriptTarget: {},
    ModuleKind: {},
    JsxEmit: {},
  },
  {
    get(target, prop) {
      if (prop in target) return target[prop]
      return undefined
    },
  },
)

module.exports = stub
module.exports.default = stub
