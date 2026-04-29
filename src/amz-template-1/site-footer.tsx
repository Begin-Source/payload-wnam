import { AmzLink } from '@/amz-template-1/AmzLink'
import type { AmzSiteConfig } from '@/amz-template-1/defaultSiteConfig'
import { amzNavHref } from '@/amz-template-1/amzNavHref'
import { FooterLinkSection } from '@/amz-template-1/components/footer-link-section'
import { normalizeGuideCategories } from '@/amz-template-1/lib/guide-categories'
import type { AppLocale } from '@/i18n/config'

function formatReviewNavLabel(categoryName: string, template: string): string {
  return template.replace(/\{name\}/g, categoryName)
}

export function AmzSiteFooter({ locale, config }: { locale: AppLocale; config: AmzSiteConfig }) {
  const categoryItems = config.homepage?.categories?.items ?? []
  const productCategoryLinks = categoryItems.map((cat) => ({
    name: cat.name,
    href: amzNavHref(locale, `/category/${cat.slug}`),
  }))

  const reviewNavTpl =
    (config.footer as { reviewCategoryNavLabelTemplate?: string }).reviewCategoryNavLabelTemplate ??
    '{name} review'

  const reviewCategoryLinks = categoryItems.map((cat) => ({
    name: formatReviewNavLabel(cat.name, reviewNavTpl),
    href: `${amzNavHref(locale, '/reviews')}?category=${encodeURIComponent(cat.slug)}`,
  }))

  const guideCategories = normalizeGuideCategories(config.pages?.guides?.categories)
  const guideLinks = [
    { name: 'All Guides', href: amzNavHref(locale, '/guides') },
    ...guideCategories.map((cat) => ({
      name: cat.name,
      href: `${amzNavHref(locale, '/guides')}?category=${encodeURIComponent(cat.slug)}`,
    })),
  ]

  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 lg:gap-x-12 lg:gap-y-8 xl:grid-cols-5">
          <div className="lg:pr-4">
            <h3 className="mb-4 font-bold text-foreground">{config.footer.about.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {config.footer.about.description}
            </p>
          </div>

          <FooterLinkSection title="Products">
            <ul className="space-y-2">
              <li>
                <AmzLink
                  href={amzNavHref(locale, '/products')}
                  className="text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  All Products
                </AmzLink>
              </li>
              {productCategoryLinks.map((category) => (
                <li key={category.href}>
                  <AmzLink
                    href={category.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {category.name}
                  </AmzLink>
                </li>
              ))}
            </ul>
          </FooterLinkSection>

          <FooterLinkSection title="Reviews">
            <ul className="space-y-2">
              <li>
                <AmzLink
                  href={amzNavHref(locale, '/reviews')}
                  className="text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  All Reviews
                </AmzLink>
              </li>
              {reviewCategoryLinks.map((category) => (
                <li key={category.href}>
                  <AmzLink
                    href={category.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {category.name}
                  </AmzLink>
                </li>
              ))}
            </ul>
          </FooterLinkSection>

          <FooterLinkSection title="Guides">
            <ul className="space-y-2">
              {guideLinks.map((guide) => (
                <li key={guide.href}>
                  <AmzLink
                    href={guide.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {guide.name}
                  </AmzLink>
                </li>
              ))}
            </ul>
          </FooterLinkSection>

          <FooterLinkSection title="Resources">
            <ul className="space-y-2">
              {config.footer.resources.map((resource) => (
                <li key={resource.href}>
                  <AmzLink
                    href={amzNavHref(locale, resource.href)}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {resource.name}
                  </AmzLink>
                </li>
              ))}
              {config.footer.legal.map((item) => (
                <li key={item.href}>
                  <AmzLink
                    href={amzNavHref(locale, item.href)}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {item.name}
                  </AmzLink>
                </li>
              ))}
            </ul>
          </FooterLinkSection>
        </div>

        <div className="mt-8 space-y-2 border-t border-border pt-8 text-center">
          <p className="text-xs text-muted-foreground">{config.footer.affiliateNotice}</p>
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} {config.footer.copyright}
          </p>
        </div>
      </div>
    </footer>
  )
}
