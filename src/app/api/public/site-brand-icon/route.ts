import {
  lucideSvgFaviconMarkupForPascalIcon,
  sanitizePascalLucideIconName,
} from '@/utilities/lucideIconSvg'
import { getPublicSiteTheme, isAmzSiteLayout } from '@/utilities/publicLandingTheme'

export const dynamic = 'force-dynamic'

/** Public SVG favicon from AMZ blueprint `brand.logo` (Lucide). Bitmap `siteLogoUrl` bypasses this URL in metadata. */
export async function GET(request: Request): Promise<Response> {
  const theme = await getPublicSiteTheme(request.headers)

  if (!isAmzSiteLayout(theme.siteLayout)) {
    return new Response('Not found', { status: 404 })
  }

  const logo = theme.amzSiteConfig?.brand.logo
  if (
    !logo ||
    (logo.type as string) !== 'lucide' ||
    !sanitizePascalLucideIconName(typeof logo.icon === 'string' ? logo.icon : '')
  ) {
    return new Response('Not found', { status: 404 })
  }

  const markup = await lucideSvgFaviconMarkupForPascalIcon(logo.icon as string)

  return new Response(markup, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      Vary: 'Host',
    },
  })
}
