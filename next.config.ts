import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { withPayload } from '@payloadcms/next/withPayload'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const stubPath = (name: string) => path.resolve(__dirname, 'src/utilities/stubs', name)

/**
 * Replace heavy server-only dependencies that NFT trace-pulls but the runtime
 * never executes. See `src/utilities/stubs/*.cjs` for per-package reasoning.
 *
 * The `$` suffix forces an *exact* match so prefix aliases don't accidentally
 * try to rewrite `next/dist/compiled/@vercel/og/index.node.js` to
 * `<stub-dir>/index.node.js` (a non-existent path).
 */
const cloudflareWorkerStubAliases: Record<string, string> = {
  redis$: stubPath('redis-stub.cjs'),
  typescript$: stubPath('typescript-stub.cjs'),
  '@vercel/og$': stubPath('vercel-og-stub.cjs'),
  'next/dist/compiled/@vercel/og$': stubPath('vercel-og-stub.cjs'),
  'next/dist/compiled/@vercel/og/index.edge.js$': stubPath('vercel-og-stub.cjs'),
  'next/dist/compiled/@vercel/og/index.node.js$': stubPath('vercel-og-stub.cjs'),
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Fewer parallel static-generation tasks reduces concurrent Miniflare D1 SQLite opens during `next build` (workerd SQLITE_BUSY). */
  experimental: {
    staticGenerationMaxConcurrency: 1,
  },
  /** Payload 3 + plugin-seo + multi-tenant can overflow TS checker on very large `payload-types.ts`. */
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
  },
  // Packages with Cloudflare Workers (workerd) specific code
  // Read more: https://opennext.js.org/cloudflare/howtos/workerd
  serverExternalPackages: ['jose', 'pg-cloudflare'],

  /**
   * Strip never-executed dependencies from the NFT (Next File Tracing) graph
   * so OpenNext's esbuild pass doesn't copy them into `handler.mjs`.
   *
   * - `typescript` (~9 MB): Next's `dist/server/typescript` does
   *   `try { require('typescript') } catch {}`; the compiler is build-only
   *   and the runtime never reaches that branch.
   * - `next/dist/compiled/@vercel/og` (~2 MB incl. wasm + fonts): no route
   *   in this app uses `ImageResponse`. NFT still trace-pulls it because
   *   Next.js declares it as a static dep of every server route.
   *
   * Drop entries here as soon as a route legitimately uses them.
   */
  outputFileTracingExcludes: {
    '*': [
      'node_modules/typescript/**',
      'node_modules/.pnpm/typescript@**/**',
      '**/node_modules/typescript/**',
      '**/next/dist/compiled/@vercel/og/**',
    ],
  },

  // Your Next.js config here
  webpack: (webpackConfig: any, { isServer }: { isServer: boolean }) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    // Import MDX (or other) files as string at build time — no runtime fs (Cloudflare Workers).
    webpackConfig.module.rules.push({
      resourceQuery: /raw/,
      type: 'asset/source',
    })

    if (isServer) {
      webpackConfig.resolve.alias = {
        ...(webpackConfig.resolve.alias ?? {}),
        ...cloudflareWorkerStubAliases,
      }

      /**
       * Next 15 forces every server-side `node_modules` package through its
       * `externals` chain so they stay as `require("typescript")` /
       * `require("@vercel/og")` in the compiled chunks. Each route bundle
       * therefore registers a webpack module like
       * `module 59899: a => a.exports = require("typescript")` *even when
       * no code path actually calls it*. OpenNext's esbuild pass follows
       * those `require()` calls statically and inlines the full 9 MB
       * TypeScript compiler / 2 MB `@vercel/og` runtime into `handler.mjs`,
       * blowing past the Cloudflare Worker bundle ceiling.
       *
       * Strategy: wrap whatever `webpackConfig.externals` Next ships with
       * so that for our targeted requests we *short-circuit* the externals
       * chain (callback with no args == "this external doesn't match"),
       * which lets webpack fall back to the alias-resolved stub file
       * instead of generating a runtime `require()`.
       */
      const stubExternalRequests = (request: string | undefined) => {
        if (!request) return false
        if (request === 'typescript') return true
        if (request === '@vercel/og') return true
        if (request === 'redis') return true
        if (request.startsWith('@redis/')) return true
        if (request.startsWith('next/dist/compiled/@vercel/og')) return true
        return false
      }
      const wrapExternal = (ext: any) => {
        if (typeof ext !== 'function') return ext
        return function patchedExternal(this: any, data: any, callback: any) {
          if (callback) {
            if (stubExternalRequests(data?.request)) {
              return callback()
            }
            return ext.call(this, data, callback)
          }
          if (stubExternalRequests(data?.request)) {
            return undefined
          }
          return ext.call(this, data)
        }
      }
      const origExternals = webpackConfig.externals
      if (Array.isArray(origExternals)) {
        webpackConfig.externals = origExternals.map(wrapExternal)
      } else if (origExternals) {
        webpackConfig.externals = wrapExternal(origExternals)
      }
    }

    return webpackConfig
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
