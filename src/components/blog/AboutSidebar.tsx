import Link from 'next/link'
import React from 'react'

import { getPayload } from 'payload'

import config from '@/payload.config'
import type { PublicSiteTheme } from '@/utilities/publicLandingTheme'

async function imageUrlForId(id: number | null): Promise<string | null> {
  if (id == null) return null
  try {
    const payload = await getPayload({ config: await config })
    const media = await payload.findByID({
      collection: 'media',
      id,
      depth: 0,
      overrideAccess: true,
    })
    return typeof media?.url === 'string' ? media.url : null
  } catch {
    return null
  }
}

type Props = {
  theme: PublicSiteTheme
}

export async function AboutSidebar(props: Props) {
  const { theme } = props
  const imgUrl = await imageUrlForId(theme.aboutImageId)
  const ctaHref = theme.aboutCtaHref?.trim() || '#'

  return (
    <aside className="blogAbout">
      <h2>{theme.aboutTitle}</h2>
      {imgUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="blogAboutAvatar" src={imgUrl} alt="" width={96} height={96} />
      ) : null}
      {theme.aboutBio ? <p className="blogAboutBio">{theme.aboutBio}</p> : null}
      <Link className="blogBtn" href={ctaHref}>
        {theme.aboutCtaLabel}
      </Link>
    </aside>
  )
}
