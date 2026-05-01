import { BlogHeader } from '@/components/blog/BlogHeader'

import type { SiteLayoutShellComponent } from '@/site-layouts/types'

export const DefaultBlogShell: SiteLayoutShellComponent = function DefaultBlogShell(props) {
  const { children, adminHref, categories, locale, theme } = props

  return (
    <div
      className={
        theme.siteLayout === 'default' ? 'blogShell' : `blogShell blogShell--${theme.siteLayout}`
      }
    >
      <BlogHeader adminHref={adminHref} categories={categories} locale={locale} theme={theme} />
      <main className="blogMain">{children}</main>
      {theme.footerLine ? (
        <footer className="blogFooter">
          <p>{theme.footerLine}</p>
        </footer>
      ) : null}
    </div>
  )
}
