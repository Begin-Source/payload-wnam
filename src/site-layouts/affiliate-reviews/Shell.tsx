import { ReviewHubFooter } from '@/components/blog/reviewHub/ReviewHubFooter'
import { ReviewHubHeader } from '@/components/blog/reviewHub/ReviewHubHeader'

import type { SiteLayoutShellComponent } from '@/site-layouts/types'

export const AffiliateReviewsShell: SiteLayoutShellComponent = function AffiliateReviewsShell(props) {
  const { children, adminHref, categories, locale, theme } = props

  return (
    <div
      className={
        theme.siteLayout === 'default' ? 'blogShell' : `blogShell blogShell--${theme.siteLayout}`
      }
    >
      <ReviewHubHeader
        adminHref={adminHref}
        categories={categories}
        locale={locale}
        theme={theme}
      />
      <main className="blogMain">{children}</main>
      <ReviewHubFooter categories={categories} locale={locale} theme={theme} />
    </div>
  )
}
