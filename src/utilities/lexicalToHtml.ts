import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function collectCodeText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const row = node as Record<string, unknown>
  if (row.type === 'linebreak') return '\n'
  if (row.type === 'text' && typeof row.text === 'string') return row.text
  if (row.type === 'tab') return '\t'
  const children = row.children
  if (!Array.isArray(children)) return ''
  return children.map((child) => collectCodeText(child)).join('')
}

/** Lexical rich text (Payload `body`) to HTML for public pages. */
export function lexicalStateToHtml(body: unknown): string {
  if (!body || typeof body !== 'object' || !('root' in (body as object))) return ''
  try {
    return convertLexicalToHTML({
      // SerializedEditorState from Lexical; types ship with @payloadcms/richtext-lexical at runtime.
      data: body as Parameters<typeof convertLexicalToHTML>[0]['data'],
      converters: ({ defaultConverters }) => ({
        ...defaultConverters,
        code: ({ node }: { node: Record<string, unknown> }) => {
          const language = typeof node.language === 'string' ? node.language.trim() : ''
          const text = escapeHtml(collectCodeText(node))
          return `<pre class="payload-code-block"${language ? ` data-language="${escapeHtml(language)}"` : ''}><code>${text}</code></pre>`
        },
      }),
      disableContainer: false,
    })
  } catch {
    return ''
  }
}
