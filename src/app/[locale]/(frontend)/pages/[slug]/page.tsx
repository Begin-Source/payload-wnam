import { notFound } from 'next/navigation'

import { CmsStaticPageArticle, generateCmsStaticPageMetadata } from '../../_lib/cmsStaticPageRoute'
import { isAppLocale } from '@/i18n/config'

type Props = { params: Promise<{ locale: string; slug: string }> }

export async function generateMetadata(props: Props) {
  const { locale, slug: raw } = await props.params
  if (!isAppLocale(locale)) return { title: 'Not found' }
  const slug = decodeURIComponent(raw)
  return generateCmsStaticPageMetadata({ locale, cmsSlug: slug, location: 'nested' })
}

export default async function StaticPage(props: Props) {
  const { locale, slug: raw } = await props.params
  if (!isAppLocale(locale)) notFound()
  return <CmsStaticPageArticle locale={locale} cmsSlug={decodeURIComponent(raw)} />
}
