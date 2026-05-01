import { AmzChrome } from './AmzChrome'

import { DefaultBlogShell } from '@/site-layouts/default/Shell'
import type { SiteLayoutShellComponent } from '@/site-layouts/types'

/** AMZ storefront shell; if `amzSiteConfig` is missing, falls back to the default blog shell (same as legacy layout). */
export const AmzTemplateShell: SiteLayoutShellComponent = function AmzTemplateShell(props) {
  const { children, locale, theme } = props
  if (!theme.amzSiteConfig) {
    return DefaultBlogShell(props)
  }
  return <AmzChrome locale={locale} config={theme.amzSiteConfig}>{children}</AmzChrome>
}
