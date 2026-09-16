import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { getRequestHost } from '@/utilities/normalizeRequestHost'
import { resolveSiteForLanding } from '@/utilities/resolveSiteForLanding'
import { normalizeSitePublicLocales } from '@/utilities/sitePublicLocales'
import { findRedirectForSite } from '@/utilities/redirectLookup'
import { isAppLocale } from '@/i18n/config'

/** One site lookup serves locale decisions and scoped redirects. Never cached across hosts. */
export async function GET(req: NextRequest) {
  const secret = process.env.INTERNAL_REDIRECT_SECRET?.trim() || 'development-redirect-secret'
  if (req.headers.get('x-redirect-secret') !== secret) return NextResponse.json({ ok: false }, { status: 404 })
  const payload = await getPayload({ config })
  const site = await resolveSiteForLanding(payload, {
    rawHost: getRequestHost(req.headers) ?? '',
    siteSlugFromHeader: req.headers.get('x-site-slug')?.trim() ?? '',
  })
  const locales = normalizeSitePublicLocales(site)
  const pathname = req.nextUrl.searchParams.get('path') ?? ''
  const first = pathname.split('/').filter(Boolean)[0]
  // Preserve locale redirects before CMS redirects, and avoid a needless query for root/unprefixed paths.
  const shouldLookup = first && isAppLocale(first) && locales.publicLocales.includes(first)
  const doc = shouldLookup ? await findRedirectForSite(payload, pathname, site?.id ?? null) : null
  return NextResponse.json({ ok: true, ...locales, redirect: doc ? { toPath: doc.toPath, statusCode: doc.statusCode === '302' ? 302 : 301 } : null }, { headers: { 'Cache-Control': 'no-store' } })
}
export const dynamic = 'force-dynamic'
