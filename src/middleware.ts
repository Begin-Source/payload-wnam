import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { defaultLocale, isAppLocale } from '@/i18n/config'
import {
  hostNameLabel,
  isLocalDevelopmentHost,
  normalizeHostForMatch,
} from '@/utilities/normalizeRequestHost'

const LOCAL_LABELS = new Set(['localhost', '127.0.0.1', '::1'])

/** Hosts that still serve `(welcome)/` at `/` (comma-separated, `normalizeHostForMatch` per label). */
function publicWelcomeRootHostsSet(): Set<string> {
  const raw = process.env.PUBLIC_WELCOME_ROOT_HOSTS ?? ''
  const out = new Set<string>()
  for (const part of raw.split(',')) {
    const n = normalizeHostForMatch(part.trim())
    if (n) out.add(n)
  }
  return out
}

const WELCOME_ROOT_HOSTS = publicWelcomeRootHostsSet()

function keepWelcomePageAtRoot(rawHost: string | null | undefined): boolean {
  if (isLocalDevelopmentHost(rawHost)) return true
  const c = normalizeHostForMatch(rawHost)
  return c.length > 0 && WELCOME_ROOT_HOSTS.has(c)
}

const SKIP_LOCALE_PREFIXES = [
  '/admin',
  '/api',
  '/_next',
  '/favicon.ico',
  '/my-route',
  '/portal',
  '/sitemap.xml',
  '/robots.txt',
]

function shouldSkipLocale(pathname: string): boolean {
  if (pathname.startsWith('/_next')) return true
  return SKIP_LOCALE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function redirectLookupSecret(): string {
  return process.env.INTERNAL_REDIRECT_SECRET?.trim() || 'development-redirect-secret'
}

type SiteLocaleMeta = {
  publicLocales: string[]
  defaultPublicLocale: string
}

async function fetchSiteLocaleMeta(
  request: NextRequest,
  forward: Headers,
): Promise<SiteLocaleMeta | null> {
  try {
    const url = new URL('/api/site-locale-meta', request.url)
    const res = await fetch(url.toString(), {
      headers: {
        'x-redirect-secret': redirectLookupSecret(),
        host: forward.get('host') ?? '',
        'x-forwarded-host': forward.get('x-forwarded-host') ?? '',
        'x-site-slug': forward.get('x-site-slug') ?? '',
      },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      ok?: boolean
      publicLocales?: string[]
      defaultPublicLocale?: string
    }
    if (
      !data.ok ||
      !Array.isArray(data.publicLocales) ||
      typeof data.defaultPublicLocale !== 'string'
    ) {
      return null
    }
    return {
      publicLocales: data.publicLocales,
      defaultPublicLocale: data.defaultPublicLocale,
    }
  } catch {
    return null
  }
}

function defaultLocaleFromMeta(meta: SiteLocaleMeta | null): string {
  if (
    meta &&
    typeof meta.defaultPublicLocale === 'string' &&
    isAppLocale(meta.defaultPublicLocale)
  ) {
    return meta.defaultPublicLocale
  }
  return defaultLocale
}

async function cmsRedirect(
  pathname: string,
  requestUrl: string,
  forward: Headers,
): Promise<{ toPath: string; statusCode: number } | null> {
  const url = new URL('/api/redirect-lookup', requestUrl)
  url.searchParams.set('path', pathname)
  const res = await fetch(url.toString(), {
    headers: {
      'x-redirect-secret': redirectLookupSecret(),
      host: forward.get('host') ?? '',
      'x-forwarded-host': forward.get('x-forwarded-host') ?? '',
      'x-site-slug': forward.get('x-site-slug') ?? '',
    },
    cache: 'no-store',
  })
  if (!res.ok) return null
  const data = (await res.json()) as { hit?: boolean; toPath?: string; statusCode?: number }
  if (!data.hit || !data.toPath) return null
  return { toPath: data.toPath, statusCode: data.statusCode === 302 ? 302 : 301 }
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const label = hostNameLabel(request.headers.get('host'))
  const isLocal = Boolean(label && LOCAL_LABELS.has(label))

  const requestHeaders = new Headers(request.headers)
  if (isLocal) {
    const site = request.nextUrl.searchParams.get('site')
    if (site?.trim()) {
      requestHeaders.set('x-site-slug', site.trim())
    }
  }

  if (shouldSkipLocale(pathname)) {
    return NextResponse.next({
      request: { headers: requestHeaders },
    })
  }

  let siteLocaleMetaPromise: Promise<SiteLocaleMeta | null> | null = null
  const getSiteLocaleMeta = () => {
    if (!siteLocaleMetaPromise) {
      siteLocaleMetaPromise = fetchSiteLocaleMeta(request, requestHeaders)
    }
    return siteLocaleMetaPromise
  }

  if (pathname === '/') {
    if (keepWelcomePageAtRoot(request.headers.get('host'))) {
      return NextResponse.next({
        request: { headers: requestHeaders },
      })
    }
    const meta = await getSiteLocaleMeta()
    const def = defaultLocaleFromMeta(meta)
    const url = request.nextUrl.clone()
    url.pathname = `/${def}`
    url.search = request.nextUrl.search
    return NextResponse.redirect(url, 308)
  }

  const segments = pathname.split('/').filter(Boolean)
  const first = segments[0]
  if (!first || !isAppLocale(first)) {
    const meta = await getSiteLocaleMeta()
    const def = defaultLocaleFromMeta(meta)
    const url = request.nextUrl.clone()
    const suffix = pathname === '/' ? '' : pathname
    url.pathname = `/${def}${suffix}`
    url.search = request.nextUrl.search
    return NextResponse.redirect(url, 308)
  }

  const meta = await getSiteLocaleMeta()
  if (
    meta &&
    meta.publicLocales.length > 0 &&
    !meta.publicLocales.includes(first)
  ) {
    const rest = segments.slice(1).join('/')
    const url = request.nextUrl.clone()
    const def = defaultLocaleFromMeta(meta)
    url.pathname = rest ? `/${def}/${rest}` : `/${def}`
    url.search = request.nextUrl.search
    return NextResponse.redirect(url, 308)
  }

  const hit = await cmsRedirect(pathname, request.url, requestHeaders)
  if (hit) {
    const target = hit.toPath
    const dest = target.startsWith('http://') || target.startsWith('https://')
      ? target
      : new URL(target, request.url).toString()
    return NextResponse.redirect(dest, hit.statusCode)
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
