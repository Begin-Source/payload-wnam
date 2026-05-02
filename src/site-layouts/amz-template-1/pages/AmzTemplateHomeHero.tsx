import type { AppLocale } from '@/i18n/config'
import type { AmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'

import { AmzHomeHeroSearch } from './AmzHomeHeroSearch'

/** Bottom curve — aligned with `amz-template-old/app/page.tsx` decorative wave. */
function AmzHeroWaveDivider() {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 overflow-hidden leading-[0]"
      aria-hidden
    >
      <svg
        viewBox="0 0 1440 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full"
        style={{ display: 'block', verticalAlign: 'bottom' }}
      >
        <path
          d="M0 120L60 105C120 90 240 60 360 45C480 30 600 30 720 37.5C840 45 960 60 1080 67.5C1200 75 1320 75 1380 75L1440 75V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z"
          fill="currentColor"
          className="text-background"
        />
      </svg>
    </div>
  )
}

function heroBannerUrl(hero: AmzSiteConfig['homepage']['hero']): string | null {
  if (hero == null || typeof hero !== 'object') return null
  const raw = 'bannerImage' in hero ? (hero as { bannerImage?: unknown }).bannerImage : undefined
  if (typeof raw !== 'string' || !raw.trim()) return null
  return raw.trim()
}

export function AmzTemplateHomeHero({
  locale,
  config,
}: {
  locale: AppLocale
  config: AmzSiteConfig
}) {
  const hero = config.homepage.hero
  const bannerSrc = heroBannerUrl(hero)

  return (
    <section
      className="relative bg-primary py-20 md:py-32"
      style={{
        WebkitBackfaceVisibility: 'hidden',
        backfaceVisibility: 'hidden',
        outline: 'none',
        border: 'none',
      }}
    >
      {bannerSrc ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
          <img alt="" src={bannerSrc} className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-primary/80 backdrop-blur-[0.5px]" />
        </div>
      ) : null}
      <div className="relative z-[1] container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center drop-shadow-[0_1px_14px_rgb(0_0_0/0.42)]">
          <h1 className="mb-6 text-balance text-4xl font-bold text-primary-foreground md:text-5xl lg:text-6xl">
            {hero.title}
          </h1>
          <p className="mb-8 text-lg leading-relaxed text-primary-foreground/90 md:text-xl">
            {hero.subtitle}
          </p>
          <AmzHomeHeroSearch locale={locale} placeholder={hero.searchPlaceholder} layout="hero" />
        </div>
      </div>
      <AmzHeroWaveDivider />
    </section>
  )
}
