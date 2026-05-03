import { AmzChrome } from './AmzChrome'

import { DefaultBlogShell } from '@/site-layouts/default/Shell'
import type { SiteLayoutShellComponent } from '@/site-layouts/types'

/** AMZ template-2 shell (old-site structure + Payload data). */
export const AmzTemplate2Shell: SiteLayoutShellComponent = function AmzTemplate2Shell(props) {
  const { children, locale, theme } = props
  if (!theme.amzSiteConfig) {
    return DefaultBlogShell(props)
  }
  return <AmzChrome locale={locale} config={theme.amzSiteConfig} enabledLocales={theme.publicLocales}>{children}</AmzChrome>
}
