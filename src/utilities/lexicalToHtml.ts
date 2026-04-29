import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'

/** Lexical rich text (Payload `body`) to HTML for public pages. */
export function lexicalStateToHtml(body: unknown): string {
  if (!body || typeof body !== 'object' || !('root' in (body as object))) return ''
  try {
    return convertLexicalToHTML({
      // SerializedEditorState from Lexical; types ship with @payloadcms/richtext-lexical at runtime.
      data: body as Parameters<typeof convertLexicalToHTML>[0]['data'],
      disableContainer: false,
    })
  } catch {
    return ''
  }
}
