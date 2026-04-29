import { describe, expect, it } from 'vitest'

import { mergeTemplate1Layers, template1BlockForLocale } from '@/utilities/publicLandingTemplate1'

describe('mergeTemplate1Layers', () => {
  it('should use blueprint t1LocaleJson as the base layer', () => {
    const theme = mergeTemplate1Layers(
      {
        t1HomeTitleEn: 'Best gear picks',
        t1FooterBottomZh: '模版页脚',
        t1NavUsePageTitleForAbout: true,
      },
      null,
    )

    expect(template1BlockForLocale(theme, 'en').homeTitle).toBe('Best gear picks')
    expect(template1BlockForLocale(theme, 'zh').footerBottom).toBe('模版页脚')
    expect(theme.t1NavUsePageTitleForAbout).toBe(true)
  })

  it('should let per-site t1LocaleJson override blueprint copy', () => {
    const theme = mergeTemplate1Layers(
      {
        t1HomeTitleEn: 'Template title',
        t1HomeSubtitleEn: 'Template subtitle',
        t1NavUsePageTitleForAbout: true,
      },
      {
        t1LocaleJson: {
          t1HomeTitleEn: 'Site title',
          t1NavUsePageTitleForAbout: false,
        },
      },
    )

    const en = template1BlockForLocale(theme, 'en')
    expect(en.homeTitle).toBe('Site title')
    expect(en.homeSubtitle).toBe('Template subtitle')
    expect(theme.t1NavUsePageTitleForAbout).toBe(false)
  })
})
