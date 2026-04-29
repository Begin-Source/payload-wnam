import type { MetadataRoute } from 'next'
import { headers } from 'next/headers.js'

import { getPublicSiteContext } from '@/utilities/publicLandingTheme'
import { getPublicBaseUrlFromHeaders } from '@/utilities/seoDocumentMeta'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const headersList = await headers()
  const baseUrl = getPublicBaseUrlFromHeaders(headersList)
  const { site } = await getPublicSiteContext(headersList)
  const disallow = ['/admin/', '/api/', '/portal/']
  if (site && site.status !== 'active') {
    disallow.unshift('/')
  }
  return {
    rules: { userAgent: '*', allow: '/', disallow },
    sitemap: baseUrl ? `${baseUrl}/sitemap.xml` : undefined,
  }
}
