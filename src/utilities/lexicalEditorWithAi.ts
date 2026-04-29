import { PayloadAiPluginLexicalEditorFeature } from '@ai-stack/payloadcms'
import { lexicalEditor } from '@payloadcms/richtext-lexical'

/** Lexical editor with Payload AI plugin features (Compose, etc.) on top of default features. */
export function lexicalEditorWithAi(): ReturnType<typeof lexicalEditor> {
  return lexicalEditor({
    features: ({ defaultFeatures }) => [
      ...defaultFeatures,
      PayloadAiPluginLexicalEditorFeature(),
    ],
  })
}
