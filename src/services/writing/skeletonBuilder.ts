/* eslint-disable @typescript-eslint/no-explicit-any -- minimal Lexical JSON */
/**
 * Produces a minimal Lexical document with one paragraph placeholder per section id.
 */
export function buildLexicalSkeleton(sectionIds: string[]): Record<string, unknown> {
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      children: [
        {
          type: 'paragraph',
          format: '',
          indent: 0,
          version: 1,
          textFormat: 0,
          textStyle: '',
          children: [
            {
              type: 'text',
              text: ' ',
              version: 1,
              format: 0,
              style: '',
              mode: 'normal',
              detail: 0,
            } as any,
          ],
        },
        ...sectionIds.map((id) => ({
          type: 'paragraph',
          format: '',
          indent: 0,
          version: 1,
          textFormat: 0,
          textStyle: '',
          dataSectionId: id,
          children: [
            {
              type: 'text',
              text: `<!-- section:${id} -->`,
              version: 1,
              format: 0,
              style: '',
              mode: 'normal',
              detail: 0,
            } as any,
          ],
        })),
      ],
      direction: 'ltr',
    },
  }
}

/**
 * True when the Lexical body still has the skeleton paragraph for `sectionId`
 * with placeholder text `<!-- section:${sectionId} -->` (merge never applied or body reverted).
 */
export function sectionSkeletonPlaceholderStillPresent(body: unknown, sectionId: string): boolean {
  const placeholder = `<!-- section:${sectionId} -->`
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  const root = b?.root && typeof b.root === 'object' ? (b.root as Record<string, unknown>) : null
  const rawChildren = root?.children
  if (!Array.isArray(rawChildren)) return false
  for (const n of rawChildren) {
    if (!n || typeof n !== 'object') continue
    const row = n as Record<string, unknown>
    if (row.type === 'paragraph' && row.dataSectionId === sectionId) {
      const ch = row.children
      if (!Array.isArray(ch) || ch.length === 0) return false
      const t = ch[0] as Record<string, unknown>
      return t?.type === 'text' && typeof t.text === 'string' && t.text.includes(placeholder)
    }
  }
  return false
}
