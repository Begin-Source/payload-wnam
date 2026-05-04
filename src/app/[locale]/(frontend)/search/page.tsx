import { headers as getHeaders } from 'next/headers.js'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AmzSearchPage as Amz1SearchPage } from '@/site-layouts/amz-template-1/pages/AmzSearchPage'
import { AmzSearchPage as Amz2SearchPage } from '@/site-layouts/amz-template-2/pages/AmzSearchPage'
import { isAppLocale } from '@/i18n/config'
import { getPublicSiteContext, isAmzSiteLayout, isAmzTemplate2Layout } from '@/utilities/publicLandingTheme'
import { getPublishedArticlesForSite } from '@/utilities/publicSiteQueries'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ q?: string | string[] }>
}

export default async function SearchPage(props: Props) {
  const { locale: localeParam } = await props.params
  const sp = await props.searchParams
  if (!isAppLocale(localeParam)) notFound()
  const locale = localeParam
  const rawQ = sp.q
  const q = (Array.isArray(rawQ) ? rawQ[0] : rawQ)?.trim() ?? ''

  const headers = await getHeaders()
  const { site, theme } = await getPublicSiteContext(headers)

  if (!site) {
    return (
      <div className="container mx-auto px-4 py-10">
        <p className="text-muted-foreground">No site resolved for this host.</p>
      </div>
    )
  }

  const articles = await getPublishedArticlesForSite(site.id, locale, 96)
  const ql = q.toLowerCase()
  const filtered =
    ql.length > 0
      ? articles.filter((a) => (a.title ?? '').toLowerCase().includes(ql))
      : []

  if (isAmzSiteLayout(theme.siteLayout) && theme.amzSiteConfig) {
    const SearchCmp = isAmzTemplate2Layout(theme.siteLayout) ? Amz2SearchPage : Amz1SearchPage
    return <SearchCmp locale={locale} defaultPublicLocale={theme.defaultPublicLocale} config={theme.amzSiteConfig} q={q} articles={filtered} />
  }

  return (
    <div className="container mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-foreground">Search</h1>
      {q ? (
        <p className="mt-2 text-muted-foreground">
          {filtered.length} result(s) for &quot;{q}&quot;
        </p>
      ) : (
        <p className="mt-2 text-muted-foreground">Enter a search query from the header.</p>
      )}

      <ul className="mt-8 space-y-4">
        {filtered.map((a) => {
          const slug = a.slug?.trim()
          const href = slug
            ? `/${locale}/posts/${encodeURIComponent(slug)}`
            : `/${locale}/posts/id-${a.id}`
          return (
            <li key={a.id}>
              <Link href={href} className="text-lg font-medium text-primary hover:underline">
                {a.title}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
