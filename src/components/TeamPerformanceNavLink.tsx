import Link from 'next/link'
import React from 'react'

import './knowledge-read-nav-link.css'

/** Sidebar link to team performance board (custom admin view). */
export function TeamPerformanceNavLink(): React.ReactElement {
  return (
    <div className="knowledgeReadNavEntry">
      <Link className="nav__link" href="/admin/teams/performance" prefetch={false}>
        <span className="nav__link-label">团队绩效</span>
      </Link>
    </div>
  )
}
