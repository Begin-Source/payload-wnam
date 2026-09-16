// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { isPayloadCLI } from '@/utilities/isPayloadCLI'

describe('Payload CLI detection', () => {
  it('ignores flags and nonexistent paths', () => {
    expect(isPayloadCLI([process.execPath, 'build', '--env=production', '/missing/bin.js'])).toBe(false)
  })
  it('resolves real CLI symlinks and tolerates broken ones', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'payload-cli-'))
    try {
      mkdirSync(path.join(dir, 'payload'))
      writeFileSync(path.join(dir, 'payload/bin.js'), '')
      symlinkSync(path.join(dir, 'payload/bin.js'), path.join(dir, 'cli'))
      symlinkSync(path.join(dir, 'missing'), path.join(dir, 'broken'))
      expect(isPayloadCLI([path.join(dir, 'broken')])).toBe(false)
      expect(isPayloadCLI([path.join(dir, 'cli'), 'migrate'])).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
