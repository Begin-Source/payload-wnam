# Article `body`: Lexical vs Markdown

## Storage (Payload)

Articles use `body` as **Lexical rich text** JSON (`type: 'richText'` in shared `postLikeFields`), not Markdown files. The Admin editor serializes to `@payloadcms/richtext-lexical` shapes (`root.children`, etc.).

## Pipeline (writing / draft_finalize)

For OpenRouter prompts we derive **linear plain text** via [`src/services/writing/lexicalBodyPlain.ts`](../src/services/writing/lexicalBodyPlain.ts) (`lexicalArticleBodyToPlainText`), then ask the model for **Markdown-shaped** output (`##` headings, lists). Results are converted back to Lexical with [`markdownToPageBodyLexical`](../src/utilities/sitePagesBundleContent/markdownToPayloadLexical).

So: **Markdown is an LLM interchange format**, not the canonical DB representation.

## Prompt delimiters

Finalize cohesion/EEAT user prompts wrap the draft in `<<<ARTICLE_BEGIN>>>` / `<<<ARTICLE_END>>>` markers (not Markdown `---`), so an empty excerpt is not mistaken for a horizontal rule.

## Empty body guard

`draft_finalize` returns a clear error if the Lexical body yields no extractable plain text, instead of calling EEAT on an empty payload.
