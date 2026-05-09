/**
 * Cloudflare Workers stub for the `redis` npm package.
 *
 * `mcp-handler@1.1.0` does `import { createClient } from 'redis'` at module top
 * and only invokes `createClient` inside its SSE branch (`disableSse: false`).
 * `@payloadcms/plugin-mcp` defaults `disableSse: true`, so `createClient` is
 * never called at runtime in this app. Bundling the real redis client (~5 MiB
 * of `@redis/{client,bloom,graph,json,search,time-series}` + undici/llhttp
 * wasm) just to satisfy the static import blows past the Cloudflare Worker
 * 62 MiB traversal limit and the 10 MiB gzip ceiling.
 *
 * If a future change actually enables SSE/Redis, replace this stub with the
 * real package via webpack alias removal.
 */
function makeStubClient() {
  /* eslint-disable @typescript-eslint/no-empty-function */
  const noop = () => {}
  const asyncNoop = async () => {}
  const throwIfUsed = () => {
    throw new Error(
      '[redis-stub] Redis client invoked at runtime, but the `redis` package is stubbed for the Cloudflare Worker build. ' +
        'Set `MCPHandlerOptions.disableSse = false` only after switching to a Workers-compatible Redis client.',
    )
  }
  return {
    on: noop,
    connect: throwIfUsed,
    disconnect: asyncNoop,
    quit: asyncNoop,
    duplicate() {
      return makeStubClient()
    },
    isOpen: false,
    isReady: false,
  }
}

function createClient() {
  return makeStubClient()
}

module.exports = {
  createClient,
  default: { createClient },
}
module.exports.default = module.exports
