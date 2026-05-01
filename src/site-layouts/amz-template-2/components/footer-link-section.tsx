'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/site-layouts/amz-template-2/components/ui/collapsible'
import { useIsMobile } from '@/site-layouts/amz-template-2/hooks/use-mobile'
import { cn } from '@/site-layouts/amz-template-2/lib/utils'

export function FooterLinkSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const isMobile = useIsMobile()
  const [open, setOpen] = React.useState(false)
  const expanded = !isMobile || open

  return (
    <Collapsible open={expanded} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 border-b border-border py-3 text-left md:hidden">
        <span className="font-semibold text-foreground">{title}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            expanded && 'rotate-180',
          )}
          aria-hidden
        />
      </CollapsibleTrigger>
      <div className="mb-4 hidden md:block">
        <h4 className="font-semibold text-foreground">{title}</h4>
      </div>
      <CollapsibleContent>
        <div className="pb-2 pt-1 md:pb-0 md:pt-0">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
