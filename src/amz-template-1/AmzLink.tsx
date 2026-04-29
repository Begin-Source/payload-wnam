'use client'

import NextLink, { type LinkProps } from 'next/link'
import { useSearchParams } from 'next/navigation'
import React, { forwardRef } from 'react'

import { appendAmzSite } from './appendAmzSite'

export type AmzLinkProps = Omit<LinkProps, 'href'> & {
  href: string
  className?: string
}

export const AmzLink = forwardRef<HTMLAnchorElement, AmzLinkProps>(function AmzLink(
  { href, ...rest },
  ref,
) {
  const sp = useSearchParams()
  const site = sp?.get('site')
  const resolved = appendAmzSite(href, site)
  return <NextLink ref={ref} href={resolved} {...rest} />
})
