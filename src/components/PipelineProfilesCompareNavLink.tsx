import Link from 'next/link'
import React from 'react'

import './knowledge-read-nav-link.css'

/** Sidebar link to KPI compare view. */
export function PipelineProfilesCompareNavLink(): React.ReactElement {
  return (
    <div className="knowledgeReadNavEntry">
      <Link className="nav__link" href="/admin/pipeline-profiles/compare" prefetch={false}>
        <span className="nav__link-label">流水线 Profile 对比</span>
      </Link>
    </div>
  )
}
