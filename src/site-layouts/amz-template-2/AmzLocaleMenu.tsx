'use client'

import { Check, ChevronDown } from 'lucide-react'
import { usePathname } from 'next/navigation'
import React from 'react'

import { AmzLink } from '@/site-layouts/amz-template-2/AmzLink'
import { Button } from '@/site-layouts/amz-template-2/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/site-layouts/amz-template-2/components/ui/dropdown-menu'
import { cn } from '@/site-layouts/amz-template-2/lib/utils'
import { hreflangTagForLocale, locales as allLocales, type AppLocale } from '@/i18n/config'
import { getLocaleRegistryEntry } from '@/i18n/localeRegistry'

function labelForLocale(loc: AppLocale): string {
  return getLocaleRegistryEntry(loc)?.label ?? loc.toUpperCase()
}

export type AmzLocaleMenuProps = {
  active: AppLocale
  /** Site-enabled locales (ordered). */
  enabledLocales: readonly AppLocale[]
  /** After choosing a locale link (e.g. close mobile drawer). */
  onItemSelect?: () => void
  align?: 'start' | 'center' | 'end'
  triggerClassName?: string
}

export function AmzLocaleMenu(props: AmzLocaleMenuProps) {
  const { active, enabledLocales, onItemSelect, align = 'end', triggerClassName } = props
  const pathname = usePathname() || '/'
  const segments = pathname.split('/').filter(Boolean)
  const tail = segments.slice(1)
  const suffix = tail.length ? `/${tail.join('/')}` : ''
  const list = enabledLocales.length > 0 ? [...enabledLocales] : [...allLocales]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'gap-1 text-foreground hover:text-primary',
            triggerClassName,
          )}
          aria-label={`Language: ${labelForLocale(active)}`}
        >
          <span className="text-sm font-medium">{labelForLocale(active)}</span>
          <ChevronDown className="size-4 shrink-0 opacity-70" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-44">
        {list.map((loc) => {
          const isActive = loc === active
          return (
            <DropdownMenuItem key={loc} asChild>
              <AmzLink
                href={`/${loc}${suffix}`}
                hrefLang={hreflangTagForLocale(loc)}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 [&:focus]:bg-transparent',
                )}
                onClick={() => onItemSelect?.()}
              >
                {isActive ? <Check className="size-4 shrink-0" aria-hidden /> : (
                  <span className="size-4 shrink-0" aria-hidden />
                )}
                {labelForLocale(loc)}
              </AmzLink>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
