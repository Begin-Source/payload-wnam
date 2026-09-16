// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { dynamicImport } from '../../src/utilities/workerDynamicImport'

const directory = mkdtempSync(join(tmpdir(), 'p0-import-'))
const fixture = join(directory, "quoted ' module.mjs")
writeFileSync(fixture, 'export const marker = 42\n')
afterAll(() => rmSync(directory, { recursive: true, force: true }))

describe('eval-free Worker dynamic imports', () => {
  it('loads absolute paths with quotes, URLs and runtime module specifiers', async () => {
    expect(await dynamicImport(fixture)).toMatchObject({ marker: 42 })
    expect(await dynamicImport(pathToFileURL(fixture).href)).toMatchObject({ marker: 42 })
    expect(await dynamicImport('node:path')).toMatchObject({ join: expect.any(Function) })
  })
  it('rejects an unresolved module instead of executing its contents', async () => {
    await expect(dynamicImport("missing-module'); throw new Error('evaluated")).rejects.toThrow()
  })
})
