import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import React from 'react'

import { lexicalStateToHtml } from '@/utilities/lexicalToHtml'
import { findKnowledgeBySlug } from '@/utilities/knowledgePortalQueries'
import type { Config } from '@/payload-types'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata(props: Props) {
  const { slug: raw } = await props.params
  const payload = await getPayload({ config: configPromise })
  const h = await headers()
  const { user } = await payload.auth({ headers: h })
  if (!user || user.collection !== 'users') {
    return { title: '知识库' }
  }
  const u = user as Config['user'] & { collection: 'users' }
  const slug = decodeURIComponent(raw)
  const doc = await findKnowledgeBySlug(payload, u, slug)
  return { title: doc?.title ? `${doc.title} · 知识库` : '知识库' }
}

export default async function PortalKnowledgeBaseDetailPage(props: Props) {
  const { slug: raw } = await props.params
  const slug = decodeURIComponent(raw)
  const payload = await getPayload({ config: configPromise })
  const h = await headers()
  const { user } = await payload.auth({ headers: h })
  if (!user || user.collection !== 'users') {
    notFound()
  }
  const u = user as Config['user'] & { collection: 'users' }
  const doc = await findKnowledgeBySlug(payload, u, slug)
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
        {updated ? <span>更新 {updated}</span> : null}
        {doc.status ? <span> · {doc.status}</span> : null}
      </div>
      {doc.summary ? <p className="knowledgePortalListMeta" style={{ marginBottom: '1.25rem' }}>{doc.summary}</p> : null}
      <div className="blogArticleBody" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  )
}
