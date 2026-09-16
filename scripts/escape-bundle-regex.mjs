import { parse } from 'acorn'

function escapePattern(pattern) {
  let result = ''
  let slashes = 0
  for (let i = 0; i < pattern.length; i++) {
    const unit = pattern.charCodeAt(i)
    if (unit > 255) {
      // Legacy regex allows identity escapes (e.g. /\中/). Replace that
      // escape, rather than accidentally introducing a literal backslash.
      if (slashes % 2) result = result.slice(0, -1)
      result += `\\u${unit.toString(16).padStart(4, '0')}`
    } else result += pattern[i]
    slashes = unit === 92 ? slashes + 1 : 0
  }
  return result
}

// esbuild escapes strings but deliberately leaves regex bodies untouched.
// A few Unicode regex literals can force a large V8 script source into a
// two-byte representation. Parse JS to target regex tokens, never strings,
// tagged template raw text, division expressions or arbitrary source text.
export function escapeBundleRegex(source) {
  const replacements = []
  const remainingTokenTypes = {}
  parse(source, {
    ecmaVersion: 'latest', sourceType: 'module',
    onToken(token) {
      if (!/[^\u0000-\u00ff]/.test(source.slice(token.start, token.end))) return
      if (token.type.label === 'regexp') {
        const pattern = escapePattern(token.value.pattern)
        // Validate transformed syntax before it can enter a release artifact.
        new RegExp(pattern, token.value.flags)
        replacements.push({ start: token.start, end: token.end, text: `/${pattern}/${token.value.flags}` })
      } else {
        remainingTokenTypes[token.type.label] = (remainingTokenTypes[token.type.label] ?? 0) + 1
      }
    },
  })
  const pieces = []
  let offset = 0
  for (const replacement of replacements) {
    pieces.push(source.slice(offset, replacement.start), replacement.text)
    offset = replacement.end
  }
  pieces.push(source.slice(offset))
  return { code: pieces.join(''), regexCount: replacements.length, remainingTokenTypes }
}
