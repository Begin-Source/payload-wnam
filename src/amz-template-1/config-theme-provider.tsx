'use client'

import type { AmzSiteConfig } from '@/amz-template-1/defaultSiteConfig'
import { generateFontCSS, generateThemeCSS } from '@/amz-template-1/theme-generator'

export function AmzConfigThemeProvider({
  config,
  children,
}: {
  config: AmzSiteConfig
  children: React.ReactNode
}) {
  const themeCSS = generateThemeCSS(config)
  const fontCSS = generateFontCSS(config)
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeCSS }} />
      <style dangerouslySetInnerHTML={{ __html: fontCSS }} />
      {children}
    </>
  )
}
