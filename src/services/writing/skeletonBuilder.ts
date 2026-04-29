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
