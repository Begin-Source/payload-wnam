import type { ReactNode } from 'react'

import '@/site-layouts/amz-template-1/amz-globals.css'

import { AmzConfigThemeProvider } from '@/site-layouts/amz-template-1/config-theme-provider'
import type { AmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import { AmzSiteFooter } from '@/site-layouts/amz-template-1/site-footer'
import { AmzSiteHeader } from '@/site-layouts/amz-template-1/site-header'
import {
  AmzSiteMobileBottomBar,
  AmzSiteMobileLayoutPad,
} from '@/site-layouts/amz-template-1/site-mobile-bottom-bar'
import type { AppLocale } from '@/i18n/config'

export function AmzChrome({
  locale,
  defaultPublicLocale,
  config,
  children,
}: {
  locale: AppLocale
  defaultPublicLocale: AppLocale
  config: AmzSiteConfig
  children: ReactNode
}) {
  return (
    <AmzConfigThemeProvider config={config}>
      <div className="flex min-h-screen flex-col">
        <AmzSiteHeader locale={locale} defaultPublicLocale={defaultPublicLocale} config={config} />
        <AmzSiteMobileLayoutPad>
          {children}
          <AmzSiteFooter locale={locale} config={config} />
        </AmzSiteMobileLayoutPad>
        <AmzSiteMobileBottomBar locale={locale} />
      </div>
    </AmzConfigThemeProvider>
  )
}
