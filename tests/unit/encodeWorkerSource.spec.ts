// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { runInNewContext } from 'node:vm'
import { encodeWorkerSource } from '../../scripts/encode-worker-source.mjs'

describe('single-byte Worker source', () => {
  it('lowers Unicode tagged templates without changing raw text, receiver, frozen arrays or call-site identity', async () => {
    const source = [
      'let first; const receiver = { tag(strings, value) {',
      'const same = first === undefined || first === strings; first = strings;',
      'return [strings[0], strings.raw[0], value, this === receiver, Object.isFrozen(strings), Object.isFrozen(strings.raw), same];',
      '} };',
      'function invoke(value) { return receiver.tag`中\\n${value}`; }',
      'globalThis.result = [invoke(1), invoke(2), String.raw`中\\n`, /[α-ω]/u.test("α")];',
    ].join('\n')
    const original: Record<string, unknown> = {}
    runInNewContext(source, original)
    const encoded = await encodeWorkerSource(source)
    expect(encoded.code).not.toMatch(/[^\u0000-\u00ff]/)
    const actual: Record<string, unknown> = {}
    runInNewContext(encoded.code, actual)
    expect(JSON.stringify(actual.result)).toBe(JSON.stringify(original.result))
  })
})
