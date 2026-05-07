'use client'

import Link from 'next/link'
import React from 'react'

import './knowledge-read-nav-link.css'

/** Sidebar link to operations strategy hub. */
export function StrategyPanelNavLink(): React.ReactElement {
  return (
    <div className="knowledgeReadNavEntry">
      <Link className="nav__link" href="/admin/strategy" prefetch={false}>
        <span className="nav__link-label">策略面板</span>
      </Link>
    </div>
  )
}
