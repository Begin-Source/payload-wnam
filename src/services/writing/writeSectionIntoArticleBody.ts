import type { Payload } from 'payload'

import type { Article } from '@/payload-types'
import { markdownToPageBodyLexical } from '@/utilities/sitePagesBundleContent/markdownToPayloadLexical'

export type WriteSectionIntoArticleBodyResult =
  | { ok: true }
  | { ok: false; reason: string }

export function sectionContentHash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return String(h >>> 0)
}

function normalizeSectionSummaries(existing: unknown): Record<string, unknown> {
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    return { ...(existing as Record<string, unknown>) }
  }
  return {}
}

function findParagraphAnchorIndex(children: unknown[], sectionId: string): number {
  for (let i = 0; i < children.length; i += 1) {
    const n = children[i]
    if (!n || typeof n !== 'object') continue
    const row = n as Record<string, unknown>
    if (row.type === 'paragraph' && row.dataSectionId === sectionId) {
      return i
    }
  }
  return -1
}

/**
 * Replace the skeleton placeholder paragraph `dataSectionId===sectionId` with Lexical blocks from markdown.
 */
export async function writeSectionIntoArticleBody(
  payload: Payload,
  args: {
    articleId: string | number
    sectionId: string
    sectionMarkdown: string
  },
): Promise<WriteSectionIntoArticleBodyResult> {
  const { articleId, sectionId, sectionMarkdown } = args
  const md = typeof sectionMarkdown === 'string' ? sectionMarkdown.trim() : ''
  const fragmentDoc = markdownToPageBodyLexical(md.length ? md : ' ')
  const newNodes =
    fragmentDoc.root &&
      typeof fragmentDoc.root === 'object' &&
      'children' in fragmentDoc.root &&
      Array.isArray((fragmentDoc.root as { children?: unknown }).children)
      ? [...((fragmentDoc.root as { children: unknown[] }).children ?? [])]
      : []

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const doc = await payload.findByID({
      collection: 'articles',
      id: String(articleId),
      depth: 0,
      overrideAccess: true,
    })
    if (!doc) {
      return { ok: false, reason: 'article_not_found' }
    }

    const body = (doc as { body?: Article['body'] }).body as Record<string, unknown> | undefined
    const root = body?.root as Record<string, unknown> | undefined
    const rawChildren = root?.children
    if (!root || !Array.isArray(rawChildren)) {
      return { ok: false, reason: 'invalid_body_structure' }
    }

    const children = [...rawChildren]
    const idx = findParagraphAnchorIndex(children, sectionId)
    if (idx === -1) {
      payload.logger.warn(
        `[writeSectionIntoArticleBody] anchor not found · articleId=${String(articleId)} section=${sectionId}`,
      )
      return { ok: false, reason: 'anchor_not_found' }
    }

    children.splice(idx, 1, ...newNodes)
    const nextBody = {
      root: {
        ...root,
        children,
      },
    } as Article['body']

    const summaries = normalizeSectionSummaries((doc as { sectionSummaries?: unknown }).sectionSummaries)
    summaries[sectionId] = {
      writtenAt: new Date().toISOString(),
      hash: sectionContentHash(md),
      excerpt: md.replace(/\s+/g, ' ').trim().slice(0, 420),
    }

    try {
      await payload.update({
        collection: 'articles',
        id: String(articleId),
        data: {
          body: nextBody,
          sectionSummaries: summaries,
        },
        overrideAccess: true,
      })
      return { ok: true }
    } catch (e) {
      if (attempt === 1) {
        return { ok: false, reason: e instanceof Error ? e.message : String(e) }
      }
    }
  }

  return { ok: false, reason: 'update_failed_retry' }
}
