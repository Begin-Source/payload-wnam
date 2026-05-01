import { describe, expect, it } from 'vitest'

import type { Article } from '@/payload-types'

import {
  finalizeLexicalArticleBody,
  lexicalArticleBodyToPlainText,
} from '@/services/writing/lexicalBodyPlain'
import { markdownToPageBodyLexical } from '@/utilities/sitePagesBundleContent/markdownToPayloadLexical'

describe('lexicalBodyPlain', () => {
  it('extracts paragraphs and headings then round-trips finalize', () => {
    const body = markdownToPageBodyLexical('# One\n\nLine two.') as Article['body']
    const plain = lexicalArticleBodyToPlainText(body)
    expect(plain.includes('One')).toBe(true)
    const finalized = finalizeLexicalArticleBody(body)
    expect(finalized.root && typeof finalized.root === 'object').toBe(true)
  })
})
