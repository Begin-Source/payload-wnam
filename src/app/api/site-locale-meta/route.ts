import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { resolveSiteForLanding } from '@/utilities/resolveSiteForLanding'
import { normalizeSitePublicLocales } from '@/utilities/sitePublicLocales'

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_REDIRECT_SECRET?.trim() || 'development-redirect-secret'
  return req.headers.get('x-redirect-secret') === secret
}

/**
 * Internal: middleware resolves per-site default locale + enabled list (Payload + D1 in route).
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false }, { status: 404 })
  }

  const host = req.headers.get('host')
  const siteSlug = req.headers.get('x-site-slug')

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const site = await resolveSiteForLanding(payload, {
    rawHost: host ?? '',
    siteSlugFromHeader: siteSlug?.trim() ?? '',
  })
  const { publicLocales, defaultPublicLocale } = normalizeSitePublicLocales(site)
  return NextResponse.json({ ok: true, publicLocales, defaultPublicLocale })
}

export const dynamic = 'force-dynamic'
