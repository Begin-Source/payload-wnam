import { describe, expect, it } from 'vitest'

import {
  FINALIZE_ARTICLE_BLOCK_BEGIN,
  buildFinalizeCohesionDefaults,
  buildFinalizeEeatDefaults,
} from '@/utilities/openRouterTenantPrompts/defaultOpenRouterTenantPromptBodies'

describe('finalize prompt delimiters', () => {
  it('uses block markers instead of --- around article_plain (cohesion)', () => {
    const { system, user } = buildFinalizeCohesionDefaults({ article_plain: 'hello' })
    expect(system).toMatch(/Lexical|delimiter/i)
    expect(user).toContain('CMS Lexical')
    expect(user).toContain(FINALIZE_ARTICLE_BLOCK_BEGIN)
    expect(user).toContain('hello')
    expect(user).not.toMatch(/\n---\s*\nhello\s*\n---\s*\n/)
  })

  it('uses block markers around article_md (EEAT)', () => {
    const { system, user } = buildFinalizeEeatDefaults({ article_md: 'body' })
    expect(system).toMatch(/delimiter|Lexical/i)
    expect(user).toContain(FINALIZE_ARTICLE_BLOCK_BEGIN)
    expect(user).toContain('body')
  })
})
