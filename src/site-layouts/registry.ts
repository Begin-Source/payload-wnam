import type { SiteLayoutId } from '@/utilities/publicLandingTheme'

import { AffiliateReviewsShell } from '@/site-layouts/affiliate-reviews/Shell'
import { AmzTemplateShell } from '@/site-layouts/amz-template-1/Shell'
import { AmzTemplate2Shell } from '@/site-layouts/amz-template-2/Shell'
import { DefaultBlogShell } from '@/site-layouts/default/Shell'
import { Template1Shell } from '@/site-layouts/template1/Shell'
import type { SiteLayoutShellComponent } from '@/site-layouts/types'

const registry: Record<SiteLayoutId, SiteLayoutShellComponent> = {
  default: DefaultBlogShell,
  wide: DefaultBlogShell,
  'affiliate_reviews': AffiliateReviewsShell,
  template1: Template1Shell,
  template2: Template1Shell,
  'amz-template-1': AmzTemplateShell,
  'amz-template-2': AmzTemplate2Shell,
}

export function getSiteLayoutShell(layout: SiteLayoutId): SiteLayoutShellComponent {
  return registry[layout] ?? DefaultBlogShell
}
