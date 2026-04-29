import { notFound } from 'next/navigation'

import { CmsStaticPageArticle, generateCmsStaticPageMetadata } from '../_lib/cmsStaticPageRoute'
import { isAppLocale } from '@/i18n/config'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata(props: Props) {
  const { locale } = await props.params
  if (!isAppLocale(locale)) return { title: 'Not found' }
  return generateCmsStaticPageMetadata({ locale, cmsSlug: 'about', location: 'root' })
}

export default async function AboutPage(props: Props) {
  const { locale } = await props.params
  if (!isAppLocale(locale)) notFound()
  return <CmsStaticPageArticle locale={locale} cmsSlug="about" />
}
