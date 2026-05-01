import type { CSSProperties } from 'react'

import type { AppLocale } from '@/i18n/config'
import {
  isAmzSiteLayout,
  isAmzTemplate2Layout,
  isTemplateShellLayout,
  type PublicSiteTheme,
} from '@/utilities/publicLandingTheme'

import type { SiteLayoutFontClasses } from './types'

export type FrontendDocumentSurface = {
  htmlClassName: string | undefined
  bodyClassName: string | undefined
  htmlStyle: CSSProperties
  bodyStyle: CSSProperties | undefined
}

/** Root `<html>` / `<body>` class names and styles (unchanged from previous inline layout logic). */
export function resolveFrontendDocumentSurface(
  theme: PublicSiteTheme,
  _locale: AppLocale,
  fonts: SiteLayoutFontClasses,
): FrontendDocumentSurface {
  const isAmz = isAmzSiteLayout(theme.siteLayout)
  const tShell = isTemplateShellLayout(theme.siteLayout)

  let bodyStyle: CSSProperties | undefined
  if (isAmz) {
    bodyStyle = undefined
  } else {
    bodyStyle = {
      backgroundColor: theme.blogContentBgColor,
      color: theme.blogBodyColor,
    }
    if (tShell) {
      bodyStyle.backgroundColor = theme.blogContentBgColor
      bodyStyle.color = theme.blogBodyColor
    } else if (theme.fontPreset === 'serif') {
      bodyStyle.fontFamily = 'Georgia, "Times New Roman", serif'
    } else if (theme.fontPreset === 'system') {
      bodyStyle.fontFamily = 'system-ui, sans-serif'
    }
  }

  const htmlStyle = (
    isAmz
      ? {}
      : {
          backgroundColor: theme.blogContentBgColor,
          '--landing-bg': theme.bgColor,
          '--landing-text': theme.textColor,
          '--landing-muted': theme.mutedColor,
          '--landing-cta-bg': theme.ctaBgColor,
          '--landing-cta-text': theme.ctaTextColor,
          '--blog-primary': theme.blogPrimaryColor,
          '--blog-accent': theme.blogAccentColor,
          '--blog-card-bg': theme.blogCardBgColor,
          '--blog-header-text': theme.blogHeaderTextColor,
          '--blog-heading': theme.blogHeadingColor,
          '--blog-body': theme.blogBodyColor,
          '--blog-muted': 'rgba(0,0,0,0.45)',
          ...(tShell
            ? ({
                '--primary': theme.blogPrimaryColor,
                '--primary-foreground': '#ffffff',
                '--background': theme.blogContentBgColor,
                '--foreground': theme.blogHeadingColor,
                '--card': theme.blogCardBgColor,
                '--muted-foreground': theme.blogBodyColor,
                '--border': 'oklch(0.9 0.005 95)',
              } as CSSProperties)
            : {}),
        }
  ) as CSSProperties

  const bodyClassName = [
    isAmz ? 'min-h-screen font-sans antialiased' : undefined,
    !isAmz && tShell ? `${fonts.interClassName} antialiased` : undefined,
    theme.fontPreset === 'noto_sans_sc' && !tShell && !isAmz ? fonts.notoSansScClassName : undefined,
  ]
    .filter(Boolean)
    .join(' ')

  const htmlClassName = [
    isAmzTemplate2Layout(theme.siteLayout)
      ? 'amz-template-2-root'
      : isAmz
        ? 'amz-template-1-root'
        : undefined,
    !isAmz && tShell
      ? theme.siteLayout === 'template2'
        ? `${fonts.interVariable} ${fonts.merriweatherVariable} template2-root`
        : `${fonts.interVariable} ${fonts.merriweatherVariable} template1-root`
      : undefined,
  ]
    .filter(Boolean)
    .join(' ')

  return {
    htmlClassName: htmlClassName || undefined,
    bodyClassName: bodyClassName || undefined,
    htmlStyle,
    bodyStyle,
  }
}
