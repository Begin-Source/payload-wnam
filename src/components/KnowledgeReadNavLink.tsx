import Link from 'next/link'
import React from 'react'

import './knowledge-read-nav-link.css'

/**
 * Admin 侧栏 `beforeNavLinks`：跳转至读者门户。
 * DOM 与 DefaultNavClient 中集合项一致：`nav__link` + `nav__link-label`（同「通知公告」）；
 * 字号通过 CSS 提到与侧栏分组「首页」同级（1rem / 正文基准）。
 */
export function KnowledgeReadNavLink(): React.ReactElement {
  return (
    <div className="knowledgeReadNavEntry">
      <Link className="nav__link" href="/portal/knowledge" prefetch={false}>
        <span className="nav__link-label">阅读知识库</span>
      </Link>
    </div>
  )
}
