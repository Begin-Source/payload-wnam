// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { runInNewContext } from 'node:vm'
import { escapeBundleRegex } from '../../scripts/escape-bundle-regex.mjs'

describe('Worker regex source encoding', () => {
  it('preserves matching, captures and replacement for Unicode ranges, astral characters and legacy identity escapes', () => {
    const literals = ['/中文+/g', '/[α-ω]/u', '/[😀-🙏]+/u', '/😀+/g', '/\\中/', '/\\\\中/', '/(?<字>中)\\k<字>/u', '/[中]/v']
    const inputs = ['中文文', 'abcαω', '😀🙏😀', '\\中', '中中', 'plain']
    for (const literal of literals) {
      const original: RegExp = runInNewContext(literal)
      const result = escapeBundleRegex(`const pattern = ${literal}; pattern`)
      expect(result.regexCount).toBe(1)
      expect(result.code).not.toMatch(/[^\u0000-\u00ff]/)
      const escaped: RegExp = runInNewContext(result.code)
      for (const input of inputs) {
        original.lastIndex = escaped.lastIndex = 0
        expect(JSON.stringify(escaped.exec(input))).toBe(JSON.stringify(original.exec(input)))
        original.lastIndex = escaped.lastIndex = 0
        expect(input.replace(escaped, '[$&]')).toBe(input.replace(original, '[$&]'))
      }
    }
  })

  it('preserves ordinary strings, raw tagged templates, comments and division', () => {
    const source = 'const a = "中文"; const b = String.raw`中\\文`; /* 中文 */ const c = 4 / 2; [a,b,c]'
    const result = escapeBundleRegex(source)
    expect(result.code).toBe(source)
    expect(result.regexCount).toBe(0)
    expect(result.remainingTokenTypes).toMatchObject({ string: 1, template: 1 })
  })
})
