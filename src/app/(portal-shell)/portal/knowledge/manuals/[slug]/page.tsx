import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import React from 'react'

import { lexicalStateToHtml } from '@/utilities/lexicalToHtml'
import { findOperationManualBySlug } from '@/utilities/knowledgePortalQueries'
import type { Config } from '@/payload-types'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

function levelLabel(level: string | null | undefined): string {
  if (level === 'intro') return '入门'
  if (level === 'advanced') return '进阶'
  if (level === 'standard') return '标准'
  return level || ''
}

export async function generateMetadata(props: Props) {
  const { slug: raw } = await props.params
  const payload = await getPayload({ config: configPromise })
  const h = await headers()
  const { user } = await payload.auth({ headers: h })
  if (!user || user.collection !== 'users') {
    return { title: '操作手册' }
  }
  const u = user as Config['user'] & { collection: 'users' }
  const slug = decodeURIComponent(raw)
  const doc = await findOperationManualBySlug(payload, u, slug)
  return { title: doc?.title ? `${doc.title} · 操作手册` : '操作手册' }
}

export default async function PortalOperationManualDetailPage(props: Props) {
  const { slug: raw } = await props.params
  const slug = decodeURIComponent(raw)
  const payload = await getPayload({ config: configPromise })
  const h = await headers()
  const { user } = await payload.auth({ headers: h })
  if (!user || user.collection !== 'users') {
    notFound()
  }
  const u = user as Config['user'] & { collection: 'users' }
  const doc = await findOperationManualBySlug(payload, u, slug)
  if (!doc) {
    notFound()
  }

  const html = lexicalStateToHtml(doc.body)
  const updated = doc.updatedAt
    ? new Date(doc.updatedAt).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <article className="knowledgePortalArticle">
      <h1 className="knowledgePortalArticleH1">{doc.title}</h1>
      <div className="knowledgePortalMeta">
        <span>级别 {levelLabel(doc.level)}</span>
        {updated ? <span> · 更新 {updated}</span> : null}
      </div>
      {doc.summary ? <p className="knowledgePortalListMeta" style={{ marginBottom: '1.25rem' }}>{doc.summary}</p> : null}
      <div className="blogArticleBody" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  )
}
