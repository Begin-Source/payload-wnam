import type { AmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'

/** AI can change copy and theme, while existing navigation and taxonomy stay connected. */
export function reapplyLockedSlices(base: AmzSiteConfig, draft: AmzSiteConfig): AmzSiteConfig {
  const out = structuredClone(draft)
  out.navigation.main = structuredClone(base.navigation.main)
  out.navigation.mainByLocale = structuredClone(base.navigation.mainByLocale)
  out.homepage.categories.items = structuredClone(base.homepage.categories.items)
  out.pages.guides.categories = structuredClone(base.pages.guides.categories)
  out.footer.resources = structuredClone(base.footer.resources)
  out.footer.legal = structuredClone(base.footer.legal)
  return out
}
