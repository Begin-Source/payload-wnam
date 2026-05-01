'use client'

import { Button } from '@/site-layouts/amz-template-2/components/ui/button'
import { Input } from '@/site-layouts/amz-template-2/components/ui/input'

/** Matches `amz-template-old` homepage CTA block; submit is no-op until a list provider is wired. */
export function AmzHomeCta({
  title,
  subtitle,
  emailPlaceholder,
  buttonText,
}: {
  title: string
  subtitle: string
  emailPlaceholder: string
  buttonText: string
}) {
  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
  }

  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-2xl bg-primary p-8 text-center md:p-12">
          <h2 className="mb-4 text-balance text-3xl font-bold text-primary-foreground md:text-4xl">
            {title}
          </h2>
          <p className="mb-8 text-lg leading-relaxed text-primary-foreground/90">{subtitle}</p>
          <form
            onSubmit={onSubmit}
            className="mx-auto flex max-w-md flex-col gap-4 sm:flex-row sm:justify-center"
          >
            <Input
              type="email"
              name="email"
              placeholder={emailPlaceholder}
              className="h-12 flex-1 bg-background text-foreground"
              autoComplete="email"
            />
            <Button
              type="submit"
              size="lg"
              className="whitespace-nowrap bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {buttonText}
            </Button>
          </form>
        </div>
      </div>
    </section>
  )
}
