import type { ReactNode } from 'react'

import '@/amz-template-1/amz-globals.css'

import { AmzConfigThemeProvider } from '@/amz-template-1/config-theme-provider'
import type { AmzSiteConfig } from '@/amz-template-1/defaultSiteConfig'
import { AmzSiteFooter } from '@/amz-template-1/site-footer'
import { AmzSiteHeader } from '@/amz-template-1/site-header'
import {
  AmzSiteMobileBottomBar,
  AmzSiteMobileLayoutPad,
} from '@/amz-template-1/site-mobile-bottom-bar'
import type { AppLocale } from '@/i18n/config'

export function AmzChrome({
  locale,
  config,
  children,
}: {
  locale: AppLocale
  config: AmzSiteConfig
  children: ReactNode
}) {
  return (
    <AmzConfigThemeProvider config={config}>
      <AmzSiteHeader locale={locale} config={config} />
      <AmzSiteMobileLayoutPad>{children}</AmzSiteMobileLayoutPad>
      <AmzSiteFooter locale={locale} config={config} />
      <AmzSiteMobileBottomBar locale={locale} />
    </AmzConfigThemeProvider>
  )
}
