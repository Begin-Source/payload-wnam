import { Image } from 'lucide-react'
import { resolveLucideIcon } from '@/utilities/resolveLucideIcon'
import React from 'react'

export function CategoryCardIcon({ name, className }: { name: string; className?: string }) {
  const Icon = resolveLucideIcon(name) ?? Image
  return <Icon className={className} />
}
