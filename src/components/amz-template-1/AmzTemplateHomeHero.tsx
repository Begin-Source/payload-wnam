import type { AmzSiteConfig } from '@/amz-template-1/defaultSiteConfig'
import type { AppLocale } from '@/i18n/config'

import { AmzHomeHeroSearch } from './AmzHomeHeroSearch'

/** Curved divider between hero and body; fill matches page background. */
function AmzHeroWaveDivider() {
  return (
    <div className="pointer-events-none absolute bottom-0 left-0 right-0 w-full leading-none">
      <svg
        viewBox="0 0 1440 80"
        aria-hidden
        className="-mb-px block h-14 w-full fill-background md:h-20"
        preserveAspectRatio="none"
      >
        <path d="M0,35 Q360,74 720,52 T1440,48 L1440,80 L0,80 Z" />
      </svg>
    </div>
  )
}

export function AmzTemplateHomeHero({
  locale,
  config,
}: {
  locale: AppLocale
  config: AmzSiteConfig
}) {
  const hero = config.homepage.hero
  const bg = config.theme.colors.dark.background
  const fg = config.theme.colors.dark.foreground

  return (
    <section className="relative isolate w-full overflow-hidden">
      {/* Single shell: bg + fg apply to all descendants so body text-foreground does not win */}
      <div
        className="relative pb-[4.75rem] pt-24 md:pb-24 md:pt-36"
        style={{ backgroundColor: bg, color: fg, textAlign: 'center' }}
      >
        <div
          className="container relative z-10 mx-auto px-4 pb-4"
          style={{ textAlign: 'center' }}
        >
          <h1
            className="text-4xl font-bold tracking-tight [color:inherit] md:text-5xl lg:text-6xl"
            style={{ textAlign: 'center' }}
          >
            {hero.title}
          </h1>
          <div className="mx-auto mt-4 max-w-2xl" style={{ textAlign: 'center' }}>
            <p
              className="text-lg opacity-95 [color:inherit] md:text-xl"
              style={{ textAlign: 'center', margin: 0 }}
            >
              {hero.subtitle}
            </p>
          </div>
          <AmzHomeHeroSearch locale={locale} placeholder={hero.searchPlaceholder} />
        </div>
        <AmzHeroWaveDivider />
      </div>
    </section>
  )
}
