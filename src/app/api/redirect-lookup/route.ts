import { NextRequest, NextResponse } from 'next/server'

import { findRedirectForPath } from '@/utilities/redirectLookup'

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_REDIRECT_SECRET?.trim() || 'development-redirect-secret'
  return req.headers.get('x-redirect-secret') === secret
}

/**
 * Internal: middleware calls this to resolve CMS redirects (Payload + D1 in route handler, not Edge).
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false }, { status: 404 })
  }
  const pathname = req.nextUrl.searchParams.get('path') ?? ''
  if (!pathname) {
    return NextResponse.json({ ok: true, hit: false })
  }

  const hdr = new Headers()
  const host = req.headers.get('host')
  const xfHost = req.headers.get('x-forwarded-host')
  const siteSlug = req.headers.get('x-site-slug')
  if (host) hdr.set('host', host)
  if (xfHost) hdr.set('x-forwarded-host', xfHost)
  if (siteSlug) hdr.set('x-site-slug', siteSlug)

  const doc = await findRedirectForPath(pathname, hdr)
  if (!doc) {
    return NextResponse.json({ ok: true, hit: false })
  }

  return NextResponse.json({
    ok: true,
    hit: true,
    toPath: doc.toPath,
    statusCode: doc.statusCode === '302' ? 302 : 301,
  })
}

export const dynamic = 'force-dynamic'
