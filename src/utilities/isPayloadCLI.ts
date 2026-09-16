import { realpathSync } from 'node:fs'
import path from 'node:path'

/** CLI arguments can be flags, missing paths or broken symlinks. */
export function isPayloadCLI(argv: readonly string[]): boolean {
  return argv.some((value) => {
    try {
      return realpathSync(value).endsWith(path.join('payload', 'bin.js'))
    } catch {
      return false
    }
  })
}
