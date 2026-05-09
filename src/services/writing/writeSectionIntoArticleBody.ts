import type { Payload } from 'payload'

import { loadBriefSectionSpecs } from '@/app/api/pipeline/lib/articlePipelineChain'
import type { Article } from '@/payload-types'
import { lexicalArticleBodyToPlainText } from '@/services/writing/lexicalBodyPlain'
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

function sectionPlaceholderMarker(sectionId: string): string {
  return `<!-- section:${sectionId} -->`
}

function paragraphMatchesSectionAnchor(row: Record<string, unknown>, sectionId: string): boolean {
  if (row.type !== 'paragraph') return false
  if (row.dataSectionId === sectionId) return true
  const marker = sectionPlaceholderMarker(sectionId)
  const ch = row.children
  if (!Array.isArray(ch)) return false
  return ch.some(
    (c) =>
      c &&
      typeof c === 'object' &&
      typeof (c as Record<string, unknown>).text === 'string' &&
      ((c as Record<string, unknown>).text as string).includes(marker),
  )
}

type AnchorLocation = { parent: unknown[]; index: number }

/** DFS: first paragraph that is the skeleton anchor for `sectionId` (id or placeholder comment). */
export function findSectionAnchorInTree(nodes: unknown[], sectionId: string): AnchorLocation | null {
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i]
    if (!n || typeof n !== 'object') continue
    const row = n as Record<string, unknown>
    if (paragraphMatchesSectionAnchor(row, sectionId)) {
      return { parent: nodes, index: i }
    }
    const ch = row.children
    if (Array.isArray(ch)) {
      const hit = findSectionAnchorInTree(ch as unknown[], sectionId)
      if (hit) return hit
    }
  }
  return null
}

/** Top-level only: matches how `buildLexicalSkeleton` lays out section placeholders. */
export function topLevelSectionPlaceholderIndex(children: unknown[], sectionId: string): number {
  for (let i = 0; i < children.length; i += 1) {
    const n = children[i]
    if (!n || typeof n !== 'object') continue
    if (paragraphMatchesSectionAnchor(n as Record<string, unknown>, sectionId)) return i
  }
  return -1
}

/**
 * When the anchor for `sectionId` is missing, insert before the first **later** section that still
 * has a top-level placeholder (preserves intro → body → faq → conclusion after brief was expanded).
 */
export function healInsertIndexAtRootLevel(
  rootChildren: unknown[],
  sectionId: string,
  orderedSectionIds: string[],
): number {
  const ix = orderedSectionIds.indexOf(sectionId)
  if (ix < 0) return rootChildren.length
  for (let j = ix + 1; j < orderedSectionIds.length; j += 1) {
    const t = topLevelSectionPlaceholderIndex(rootChildren, orderedSectionIds[j])
    if (t >= 0) return t
  }
  return rootChildren.length
}

function cloneArticleBody(body: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(body)) as Record<string, unknown>
}

type MergePlan =
  | { op: 'replace'; parent: unknown[]; index: number }
  | { op: 'insert'; parent: unknown[]; index: number }

/**
 * Replace the skeleton placeholder paragraph `dataSectionId===sectionId` (or `<!-- section:id -->`)
 * with Lexical blocks from markdown. Walks the full tree so nested blocks still match.
 * If the anchor is missing but this section was already merged (`sectionSummaries`) and the body still
 * reflects that merge (non-empty plain text + excerpt or hash match), succeeds without change.
 * If there is no placeholder for this section, inserts at the ordered position when `briefId` is provided
 * (before the next section's top-level placeholder), else at root end.
 */
export async function writeSectionIntoArticleBody(
  payload: Payload,
  args: {
    articleId: string | number
    sectionId: string
    sectionMarkdown: string
    /** When set, missing anchors heal **before** the next outline section that still has a placeholder. */
    briefId?: number
  },
): Promise<WriteSectionIntoArticleBodyResult> {
  const { articleId, sectionId, sectionMarkdown, briefId } = args
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
    if (!body || typeof body !== 'object') {
      return { ok: false, reason: 'invalid_body_structure' }
    }

    let bodyWorking: Record<string, unknown>
    try {
      bodyWorking = cloneArticleBody(body)
    } catch {
      return { ok: false, reason: 'invalid_body_structure' }
    }

    const root = bodyWorking.root as Record<string, unknown> | undefined
    const rootChildren = root?.children
    if (!root || !Array.isArray(rootChildren)) {
      return { ok: false, reason: 'invalid_body_structure' }
    }

    const anchorLoc = findSectionAnchorInTree(rootChildren, sectionId)
    const summariesRead = normalizeSectionSummaries((doc as { sectionSummaries?: unknown }).sectionSummaries)
    const priorSummary = summariesRead[sectionId] as { writtenAt?: unknown } | undefined

    let plan: MergePlan

    if (anchorLoc) {
      plan = { op: 'replace', parent: anchorLoc.parent, index: anchorLoc.index }
    } else {
      const prior = priorSummary as
        | { writtenAt?: unknown; excerpt?: unknown; hash?: unknown }
        | undefined
      const plainFromBody = lexicalArticleBodyToPlainText(body).trim()
      if (
        typeof prior?.writtenAt === 'string' &&
        prior.writtenAt.length > 0 &&
        plainFromBody.length > 0
      ) {
        const excerpt =
          typeof prior.excerpt === 'string' ? prior.excerpt.replace(/\s+/g, ' ').trim() : ''
        const storedHash = typeof prior.hash === 'string' ? prior.hash.trim() : ''
        const hashMatchesIncoming = storedHash.length > 0 && storedHash === sectionContentHash(md)
        const excerptProbe =
          excerpt.length >= 12 ? excerpt.slice(0, Math.min(64, excerpt.length)) : excerpt
        const excerptMatches =
          excerpt.length > 0 && excerptProbe.length > 0 && plainFromBody.includes(excerptProbe)
        if (hashMatchesIncoming || excerptMatches) {
          return { ok: true }
        }
      }
      let serialized: string
      try {
        serialized = JSON.stringify(body)
      } catch {
        serialized = ''
      }
      if (serialized.includes(sectionPlaceholderMarker(sectionId))) {
        payload.logger.warn(
          `[writeSectionIntoArticleBody] placeholder in body but no paragraph anchor · articleId=${String(articleId)} section=${sectionId}`,
        )
        return { ok: false, reason: 'anchor_not_found' }
      }

      let orderedIds: string[] | null = null
      if (typeof briefId === 'number' && Number.isFinite(briefId)) {
        try {
          const specs = await loadBriefSectionSpecs(payload, briefId)
          orderedIds = specs.map((s) => s.id)
        } catch {
          orderedIds = null
        }
      }

      const insertIdx =
        orderedIds && orderedIds.length > 0 ?
          healInsertIndexAtRootLevel(rootChildren, sectionId, orderedIds)
        : rootChildren.length

      plan = { op: 'insert', parent: rootChildren, index: insertIdx }
      payload.logger.warn(
        `[writeSectionIntoArticleBody] anchor missing; heal-insert at root index ${insertIdx} · articleId=${String(articleId)} section=${sectionId} briefId=${briefId != null ? String(briefId) : 'none'}`,
      )
    }

    if (plan.op === 'replace') {
      plan.parent.splice(plan.index, 1, ...newNodes)
    } else {
      plan.parent.splice(plan.index, 0, ...newNodes)
    }
    const nextBody = bodyWorking as Article['body']

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
