import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import React from 'react'

import { KnowledgePortalSideNav } from '@/components/knowledge-portal/KnowledgePortalSideNav'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { getKnowledgePortalNavData } from '@/utilities/knowledgePortalQueries'
import type { Config } from '@/payload-types'

import '@/components/blog/blog.css'
import './knowledge-portal.css'

/** Logged-in + D1: avoid static prerender during `next build` (no session / fewer SQLITE races). */
export const dynamic = 'force-dynamic'

type Props = {
  children: React.ReactNode
}

/**
 * 登录后阅读「知识库 / 操作手册」；与 Admin 共享 Payload 会话。
 * 两列：左侧可折叠目录 + 右侧主内容。
 */
export default async function PortalKnowledgeLayout(props: Props) {
  const { children } = props
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user || !isUsersCollection(user)) {
    redirect('/admin/login')
  }
  const u = user as Config['user'] & { collection: 'users' }
  const nav = await getKnowledgePortalNavData(payload, u)

  return (
    <div className="knowledgePortalPage">
      <header className="knowledgePortalHeader knowledgePortalHeader--full">
        <h1 className="knowledgePortalTitle">知识库阅读</h1>
        <nav className="knowledgePortalNav" aria-label="页面导航">
          <Link href="/">系统首页</Link>
          <Link href="/admin">管理后台</Link>
        </nav>
      </header>
      <div className="knowledgePortalShell">
        <aside className="knowledgePortalShell__aside">
          <KnowledgePortalSideNav kbGroups={nav.kbGroups} manualGroups={nav.manualGroups} />
        </aside>
        <div className="knowledgePortalShell__main">{children}</div>
      </div>
    </div>
  )
}
