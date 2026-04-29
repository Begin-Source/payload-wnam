import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import React from 'react'

import { getKnowledgePortalNavData } from '@/utilities/knowledgePortalQueries'
import type { Config } from '@/payload-types'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: '知识库阅读',
}

export default async function PortalKnowledgeIndexPage() {
  const payload = await getPayload({ config: configPromise })
  const h = await headers()
  const { user } = await payload.auth({ headers: h })
  if (!user || user.collection !== 'users') {
    return null
  }
  const u = user as Config['user'] & { collection: 'users' }
  const nav = await getKnowledgePortalNavData(payload, u)

  return (
    <main className="knowledgePortalWelcome">
      <p className="knowledgePortalWelcomeLead">
        请从<strong>左侧目录</strong>展开「知识库文档」「操作手册」，按类型或级别浏览已发布内容。
      </p>
      <ul className="knowledgePortalWelcomeStats" aria-label="可访问条目数">
        <li>
          知识库文档（含有效链接）：<strong>{nav.kbLinkableCount}</strong> 篇
        </li>
        <li>
          操作手册（含有效链接）：<strong>{nav.manualLinkableCount}</strong> 篇
        </li>
      </ul>
      {nav.kbLinkableCount === 0 && nav.manualLinkableCount === 0 ? (
        <p className="knowledgePortalEmpty">
          暂无可读文档，或您暂无访问权限。已发布且含 URL 别名的条目会出现在左侧。
        </p>
      ) : null}
    </main>
  )
}
