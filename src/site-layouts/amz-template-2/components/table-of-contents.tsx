'use client'

import { List } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/site-layouts/amz-template-2/components/ui/card'
import { cn } from '@/site-layouts/amz-template-2/lib/utils'

interface TOCHeading {
  id: string
  text: string
  level: number
}

interface TableOfContentsProps {
  className?: string
  /** 2 = h2 only, 3 = h2 and h3 */
  maxLevel?: 2 | 3
}

export function TableOfContents({ className, maxLevel = 3 }: TableOfContentsProps) {
  const [headings, setHeadings] = useState<TOCHeading[]>([])
  const [activeId, setActiveId] = useState<string>('')

  useEffect(() => {
    const contentElement =
      document.querySelector('[data-amz-article-prose]') ||
      document.querySelector('article .prose') ||
      document.querySelector('main .prose')
    if (!contentElement) return

    const selector = maxLevel === 2 ? 'h2' : 'h2, h3'
    const headingElements = contentElement.querySelectorAll(selector)
    const headingData: TOCHeading[] = []

    headingElements.forEach((heading, index) => {
      const level = parseInt(heading.tagName.charAt(1), 10)
      const text = heading.textContent || ''

      let id = heading.id
      if (!id) {
        id = text
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim()

        if (headingData.some((h) => h.id === id)) {
          id = `${id}-${index}`
        }

        heading.id = id
      }

      headingData.push({ id, text, level })
    })

    setHeadings(headingData)

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      {
        rootMargin: '-80px 0px -80% 0px',
      },
    )

    headingElements.forEach((heading) => {
      observer.observe(heading)
    })

    return () => {
      headingElements.forEach((heading) => {
        observer.unobserve(heading)
      })
    }
  }, [maxLevel])

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    const element = document.getElementById(id)
    if (element) {
      const offset = 80
      const elementPosition = element.getBoundingClientRect().top + window.scrollY
      const offsetPosition = elementPosition - offset

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      })

      window.history.pushState(null, '', `#${id}`)
      setActiveId(id)
    }
  }

  if (headings.length === 0) {
    return null
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <List className="h-5 w-5 text-primary" />
          Table of Contents
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-[calc(100vh-200px)] overflow-y-auto">
        <nav aria-label="Table of contents">
          <ul className="space-y-2">
            {headings.map((heading) => (
              <li
                key={heading.id}
                className={cn('text-sm transition-all duration-200', heading.level === 3 && 'pl-4')}
              >
                <a
                  href={`#${heading.id}`}
                  onClick={(e) => handleClick(e, heading.id)}
                  className={cn(
                    'block rounded-md px-3 py-1.5 transition-colors hover:bg-muted/50',
                    activeId === heading.id
                      ? 'border-l-2 border-primary bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {heading.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </CardContent>
    </Card>
  )
}
