'use client'

import Link from 'next/link'
import React from 'react'

import './knowledge-read-nav-link.css'

/** Sidebar link to the site launch operations panel. */
export function SiteLaunchPanelNavLink(): React.ReactElement {
  return (
    <div className="knowledgeReadNavEntry">
      <Link className="nav__link" href="/admin/site-launch" prefetch={false}>
        <span className="nav__link-label">站点启动</span>
      </Link>
    </div>
  )
}
