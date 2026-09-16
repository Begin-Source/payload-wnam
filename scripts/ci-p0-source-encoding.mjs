import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { encodeWorkerSource } from './encode-worker-source.mjs'

if (process.env.WORKERS_CI !== '1') throw new Error('Source encoding optimization requires Cloudflare Builds')
// Limit the experiment to the isolated P0 branch until its runtime gate passes.
if (process.env.WORKERS_CI_BRANCH === 'feat/site-per-d1') {
  for (const file of ['.open-next/server-functions/default/handler.mjs', '.open-next/middleware/handler.mjs']) {
    if (!existsSync(file)) continue
    const source = readFileSync(file, 'utf8')
    const result = await encodeWorkerSource(source)
    writeFileSync(file, result.code)
    console.log(JSON.stringify({ event: 'p0_source_encoding', file,
      regexCount: result.regexCount, remainingTokenTypes: result.remainingTokenTypes,
      nonLatin1Before: (source.match(/[^\u0000-\u00ff]/g) ?? []).length,
      nonLatin1After: (result.code.match(/[^\u0000-\u00ff]/g) ?? []).length,
    }))
  }
}
