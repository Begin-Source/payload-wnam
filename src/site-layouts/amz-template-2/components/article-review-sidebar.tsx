import { ArrowRight, Package } from 'lucide-react'
import React from 'react'

import { AmzLink } from '@/site-layouts/amz-template-2/AmzLink'
import { Button } from '@/site-layouts/amz-template-2/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/site-layouts/amz-template-2/components/ui/card'
import { amzNavHref } from '@/site-layouts/amz-template-2/amzNavHref'
import type { AppLocale } from '@/i18n/config'
import type { Article, Category, Media } from '@/payload-types'

function thumbUrl(article: Article): string | null {
  const img = article.featuredImage
  if (img != null && typeof img === 'object' && 'url' in img && typeof (img as Media).url === 'string') {
    return (img as Media).url
  }
  return null
}

export function ArticleReviewSidebar({
  locale,
  category,
  currentArticleId,
  sidebarArticles,
}: {
  locale: AppLocale
  category: Category | null
  currentArticleId: number
  sidebarArticles: Article[]
}) {
  const related = sidebarArticles.filter((a) => a.id !== currentArticleId).slice(0, 4)

  return (
    <div className="space-y-6 lg:sticky lg:top-24">
      {related.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Package className="h-5 w-5 text-primary" />
              Related
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {related.map((article) => {
                const img = thumbUrl(article)
                const href = `/${locale}/posts/${encodeURIComponent(article.slug)}`
                return (
                  <div
                    key={article.id}
                    className="rounded-lg border border-border p-3 transition-colors hover:border-primary/50"
                  >
                    <AmzLink href={href} className="group block">
                      <div className="mb-3 flex gap-3">
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={img}
                            alt=""
                            className="h-16 w-16 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="h-16 w-16 shrink-0 rounded bg-muted" />
                        )}
                        <div className="min-w-0 flex-1">
                          <h5 className="line-clamp-2 text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                            {article.title}
                          </h5>
                        </div>
                      </div>
                    </AmzLink>
                  </div>
                )
              })}
            </div>
            {category?.slug ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="mt-4 h-auto min-h-9 w-full min-w-0 whitespace-normal py-2"
              >
                <AmzLink
                  href={amzNavHref(locale, `/category/${category.slug}`)}
                  className="inline-flex items-start gap-2 text-left break-words [overflow-wrap:anywhere]"
                >
                  <span className="min-w-0 flex-1">View all in {category.name}</span>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0" />
                </AmzLink>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick links</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Button asChild variant="ghost" size="sm" className="w-full justify-start">
              <AmzLink href={amzNavHref(locale, '/reviews')}>All reviews</AmzLink>
            </Button>
            <Button asChild variant="ghost" size="sm" className="w-full justify-start">
              <AmzLink href={amzNavHref(locale, '/guides')}>Buying guides</AmzLink>
            </Button>
            {category?.slug ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-auto min-h-9 w-full min-w-0 justify-start whitespace-normal py-2"
              >
                <AmzLink
                  href={amzNavHref(locale, `/category/${category.slug}`)}
                  className="block w-full break-words text-left [overflow-wrap:anywhere]"
                >
                  {category.name} reviews
                </AmzLink>
              </Button>
            ) : null}
            <Button asChild variant="ghost" size="sm" className="w-full justify-start">
              <AmzLink href={amzNavHref(locale, '/about')}>About</AmzLink>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
