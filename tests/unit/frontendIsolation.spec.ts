import { describe, expect, it, vi } from 'vitest'
import { defaultAmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import { generateThemeCSS, generateFontCSS } from '@/site-layouts/amz-template-1/theme-generator'
import { readFileSync } from 'node:fs'
vi.mock('@/utilities/publicLandingTheme', () => ({
  isAmzSiteLayout: (id: string) => id.startsWith('amz-template-'),
  isAmzTemplate2Layout: (id: string) => id === 'amz-template-2',
  isTemplateShellLayout: (id: string) => id === 'template1' || id === 'template2',
}))
import { resolveFrontendDocumentSurface } from '@/site-layouts/documentSurface'
import type { PublicSiteTheme, SiteLayoutId } from '@/utilities/publicLandingTheme'

describe('frontend template boundaries', () => {
  it.each(['default', 'wide', 'affiliate_reviews', 'template1', 'template2', 'amz-template-1', 'amz-template-2'] as SiteLayoutId[])('assigns %s its own document scope', siteLayout => {
    const surface = resolveFrontendDocumentSurface({ siteLayout } as PublicSiteTheme, 'en', { interClassName: 'inter', interVariable: 'inter-var', merriweatherVariable: 'serif-var', notoSansScClassName: 'noto' })
    expect(surface.htmlClassName).toContain(siteLayout.replaceAll('_', '-') + '-root')
  })
  it('emits only validated colors and escaped font strings in the owning root', () => {
    const config = structuredClone(defaultAmzSiteConfig)
    config.fonts.sans = 'Bad";</style><script>alert(1)</script>'
    config.theme.colors.light.primary = 'red; } body { display:none'
    const css = generateThemeCSS(config, 'amz-template-2') + generateFontCSS(config, 'amz-template-2')
    expect(css).not.toContain('</style>')
    expect(css).not.toContain('display:none')
    expect(css).not.toContain(':root')
    expect(css).toContain('html.amz-template-2-root.dark')
    expect(css).toContain(defaultAmzSiteConfig.theme.colors.light.primary)
  })
  it('keeps original blog typography out of template shells and scopes fallback themes', () => {
    const legacy = readFileSync('src/app/[locale]/(frontend)/styles.css', 'utf8')
    expect(legacy.trimStart()).toMatch(/^\/\*[\s\S]*?\*\/\s*:where\(html.default-root, html.wide-root, html.affiliate-reviews-root\) \{/)
    for (const n of [1, 2]) {
      const css = readFileSync(`src/site-layouts/amz-template-${n}/amz-globals.css`, 'utf8')
      expect(css).not.toMatch(/(^|\n):root\s*\{/)
      expect(css).not.toMatch(/\n  (\*|body|\.prose)\s*\{/)
      expect(css).toContain(`html.amz-template-${n}-root`)
    }
  })
})
