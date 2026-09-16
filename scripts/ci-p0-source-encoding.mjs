import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { encodeWorkerSource } from './encode-worker-source.mjs'

if (process.env.WORKERS_CI !== '1') throw new Error('Source encoding optimization requires Cloudflare Builds')
// Retain P0's verified one-byte source invariant while implementing P1 here.
// Extend to each production role only with its corresponding release validation.
if (process.env.WORKERS_CI_BRANCH === 'feat/site-per-d1') {
  for (const file of ['.open-next/server-functions/default/handler.mjs', '.open-next/middleware/handler.mjs']) {
    if (!existsSync(file)) continue
    const source = readFileSync(file, 'utf8')
    const result = await encodeWorkerSource(source)
    if (/[^\u0000-\u00ff]/.test(result.code)) throw new Error(`Worker source encoding regressed: ${file}`)
    writeFileSync(file, result.code)
    console.log(JSON.stringify({ event: 'p0_source_encoding', file,
      regexCount: result.regexCount, remainingTokenTypes: result.remainingTokenTypes,
      nonLatin1Before: (source.match(/[^\u0000-\u00ff]/g) ?? []).length,
      nonLatin1After: (result.code.match(/[^\u0000-\u00ff]/g) ?? []).length,
    }))
  }
}
