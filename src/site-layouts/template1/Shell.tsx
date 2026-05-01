import type { AppLocale } from '@/i18n/config'
import { Template1Footer } from '@/components/template1/Template1Footer'
import { Template1Header } from '@/components/template1/Template1Header'
import {
  applyTemplate1Placeholders,
  template1BlockForLocale,
} from '@/utilities/publicLandingTemplate1'
import type { SiteLayoutShellComponent } from '@/site-layouts/types'
import type { Site } from '@/payload-types'
import type { PublicSiteTheme } from '@/utilities/publicLandingTheme'
import { resolveT1NavAboutLabel, resolveT1NavContactLabel } from '@/utilities/template1NavLabels'

function siteInitials(name: string): string {
  const t = name.trim()
  if (!t) return '·'
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0]!.slice(0, 1) + parts[1]!.slice(0, 1)).toUpperCase()
  }
  return t.slice(0, 2).toUpperCase()
}

async function buildT1CompanyLinks(
  locale: AppLocale,
  site: Site | null,
  theme: PublicSiteTheme,
): Promise<{ label: string; href: string }[]> {
  if (theme.footerResourceLinks.length > 0) {
    return theme.footerResourceLinks
  }
  const base = `/${locale}`
  const t1b = template1BlockForLocale(theme.template1, locale)
  const aboutL =
    site != null
      ? await resolveT1NavAboutLabel(
          site.id,
          locale,
          theme.template1.t1NavUsePageTitleForAbout,
          t1b.navAbout,
        )
      : t1b.navAbout
  const contactL =
    site != null
      ? await resolveT1NavContactLabel(
          site.id,
          locale,
          theme.template1.t1NavUsePageTitleForContact,
          t1b.navContact,
        )
      : t1b.navContact
  return [
    { label: aboutL, href: `${base}/about` },
    { label: contactL, href: `${base}/contact` },
    { label: t1b.navPrivacy, href: `${base}/privacy` },
  ]
}

export const Template1Shell: SiteLayoutShellComponent = async function Template1Shell(props) {
  const { children, categories, locale, site, theme } = props
  const t1b = template1BlockForLocale(theme.template1, locale)
  const aboutNav =
    site != null
      ? await resolveT1NavAboutLabel(
          site.id,
          locale,
          theme.template1.t1NavUsePageTitleForAbout,
          t1b.navAbout,
        )
      : t1b.navAbout
  const year = new Date().getFullYear()
  const t1HeaderLabels = {
    allReviews: t1b.navAllReviews,
    categories: t1b.navCategories,
    about: aboutNav,
    searchSr: t1b.navSearchSr,
    menuSr: t1b.navMenuSr,
  }
  const t1FooterLabels = {
    categoriesHeading: t1b.footerCategoriesHeading,
    companyHeading: t1b.footerCompanyHeading,
    affiliateDisclosure: t1b.footerAffiliateLabel,
    copyrightLine: applyTemplate1Placeholders(t1b.footerCopyright, {
      year,
      siteName: theme.siteName,
    }),
    bottomLine: t1b.footerBottom,
  }
  const t1CompanyLinks = await buildT1CompanyLinks(locale, site, theme)

  return (
    <>
      <Template1Header
        locale={locale}
        siteName={theme.siteName}
        siteInitials={siteInitials(theme.siteName)}
        categories={categories}
        labels={t1HeaderLabels}
      />
      <main>{children}</main>
      <Template1Footer
        locale={locale}
        theme={theme}
        categories={categories}
        labels={t1FooterLabels}
        companyLinks={t1CompanyLinks}
      />
    </>
  )
}
