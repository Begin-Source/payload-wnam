import * as LucideIcons from 'lucide-react'
import React from 'react'

export function CategoryCardIcon({ name, className }: { name: string; className?: string }) {
  const Icon =
    (LucideIcons as Record<string, React.ComponentType<{ className?: string }>>)[name] ??
    LucideIcons.Image
  return <Icon className={className} />
}
