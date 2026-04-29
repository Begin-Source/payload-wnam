'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React from 'react'

import type { PortalNavKbGroup, PortalNavManualGroup } from '@/utilities/knowledgePortalGrouping'

type Props = {
  kbGroups: PortalNavKbGroup[]
  manualGroups: PortalNavManualGroup[]
}

function isActiveKbPath(pathname: string, slug: string): boolean {
  const prefix = '/portal/knowledge/kb/'
  if (!pathname.startsWith(prefix)) return false
  const seg = pathname.split('?')[0].slice(prefix.length)
  try {
    return decodeURIComponent(seg) === slug
  } catch {
    return seg === encodeURIComponent(slug)
  }
}

function isActiveManualPath(pathname: string, slug: string): boolean {
  const prefix = '/portal/knowledge/manuals/'
  if (!pathname.startsWith(prefix)) return false
  const seg = pathname.split('?')[0].slice(prefix.length)
  try {
    return decodeURIComponent(seg) === slug
  } catch {
    return seg === encodeURIComponent(slug)
  }
}

export function KnowledgePortalSideNav(props: Props): React.ReactElement {
  const { kbGroups, manualGroups } = props
  const pathname = usePathname() || ''

  return (
    <nav className="knowledgePortalSideNav" aria-label="知识库目录">
      <details className="knowledgePortalTree" open>
        <summary className="knowledgePortalTree__summary">知识库文档</summary>
        <div className="knowledgePortalTree__body">
          {kbGroups.length === 0 ? (
            <p className="knowledgePortalTree__empty">暂无可读文档</p>
          ) : (
            kbGroups.map((g) => (
              <details key={g.key} className="knowledgePortalTree knowledgePortalTree--nested" open>
                <summary className="knowledgePortalTree__summarySub">{g.label}</summary>
                <ul className="knowledgePortalTree__list">
                  {g.items.map((item) => {
                    const href = `/portal/knowledge/kb/${encodeURIComponent(item.slug)}`
                    const active = isActiveKbPath(pathname, item.slug)
                    return (
                      <li key={item.id}>
                        <Link
                          className="knowledgePortalTree__link"
                          data-active={active ? 'true' : undefined}
                          href={href}
                        >
                          {item.title}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </details>
            ))
          )}
        </div>
      </details>
      <details className="knowledgePortalTree" open>
        <summary className="knowledgePortalTree__summary">操作手册</summary>
        <div className="knowledgePortalTree__body">
          {manualGroups.length === 0 ? (
            <p className="knowledgePortalTree__empty">暂无已发布手册</p>
          ) : (
            manualGroups.map((g) => (
              <details key={g.key} className="knowledgePortalTree knowledgePortalTree--nested" open>
                <summary className="knowledgePortalTree__summarySub">{g.label}</summary>
                <ul className="knowledgePortalTree__list">
                  {g.items.map((item) => {
                    const href = `/portal/knowledge/manuals/${encodeURIComponent(item.slug)}`
                    const active = isActiveManualPath(pathname, item.slug)
                    return (
                      <li key={item.id}>
                        <Link
                          className="knowledgePortalTree__link"
                          data-active={active ? 'true' : undefined}
                          href={href}
                        >
                          {item.title}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </details>
            ))
          )}
        </div>
      </details>
    </nav>
  )
}
