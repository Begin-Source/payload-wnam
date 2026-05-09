/**
 * Cloudflare Workers stub for `@vercel/og`.
 *
 * The repository does not call `ImageResponse` / `next/og` / `opengraph-image`
 * anywhere. `next/dist/compiled/@vercel/og` (537 KiB index.edge.js +
 * resvg.wasm 1.3 MiB + yoga.wasm 86 KiB + font 27 KiB) is still trace-pulled
 * into every server route by Next.js's NFT pass. Aliasing it to this stub
 * removes that overhead from the Cloudflare Worker bundle.
 *
 * If a route later imports `ImageResponse`, drop the alias entry in
 * `next.config.ts` to restore the real implementation.
 */
class ImageResponse {
  constructor() {
    throw new Error(
      '[vercel-og-stub] `@vercel/og` is stubbed in the Cloudflare Worker build. Remove the next.config.ts alias before using ImageResponse.',
    )
  }
}

module.exports = { ImageResponse }
module.exports.default = ImageResponse
