import { PayloadAiPluginLexicalEditorFeature } from '@ai-stack/payloadcms'
import { lexicalEditor } from '@payloadcms/richtext-lexical'

/**
 * Lexical editor with Payload AI plugin features (Compose, etc.) on top of default features.
 *
 * Phase 2 (AI cost ledger): @ai-stack/payloadcms drives generation from the admin client; this repo
 * does not expose a single server hook to attribute spend per compose action. Use upstream callbacks
 * or wrap the plugin’s fetch layer if we need `recordOpenRouterAiCost` parity with pipeline routes.
 */
export function lexicalEditorWithAi(): ReturnType<typeof lexicalEditor> {
  return lexicalEditor({
    features: ({ defaultFeatures }) => [
      ...defaultFeatures,
      PayloadAiPluginLexicalEditorFeature(),
    ],
  })
}
