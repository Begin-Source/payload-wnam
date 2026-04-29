import type { CollectionBeforeChangeHook } from 'payload'

import { writeVetoHotCacheEntry } from '@/collections/hooks/writeVetoHotCache'
import { applyAuditorVetoTable, listContainsHardVeto } from '@/utilities/eeatScoring'

type QualityPayload = { vetoes?: string[]; rawScore?: number }

function appendOptimizationHistory(
  existing: unknown,
  entry: Record<string, unknown>,
): Record<string, unknown>[] {
  const list = Array.isArray(existing) ? [...existing] : []
  list.push(entry)
  return list as Record<string, unknown>[]
}

function relationId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value
  if (value && typeof value === 'object' && 'id' in value && typeof (value as { id: unknown }).id === 'string') {
    return (value as { id: string }).id
  }
  return null
}

/**
 * Enforces author on publish; optional `data._quality` (internal) applies auditor veto cap.
 * Hard vetoes (T04/C01/R10): block first publish; on already-published saves → `lifecycleStage=dying` + hot-cache row.
 */
export const articlePublishGate: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const next = { ...data } as Record<string, unknown> & { _quality?: QualityPayload }
  const wasPublished = originalDoc?.status === 'published'
  const willPublish = next.status === 'published'
  if (willPublish && !next.author) {
    throw new Error('Author is required to publish (EEAT).')
  }

  const q = next._quality
  const siteId = relationId(next.site ?? (originalDoc as { site?: unknown } | null)?.site)
  const subject =
    (typeof next.title === 'string' && next.title) ||
    (originalDoc as { title?: string } | null)?.title ||
    (originalDoc as { id?: string } | null)?.id ||
    'article'

  if (q && typeof q.rawScore === 'number' && Array.isArray(q.vetoes)) {
    const vetoes = q.vetoes.filter((v): v is string => typeof v === 'string')
    const hard = listContainsHardVeto(vetoes)

    if (hard) {
      if (willPublish) {
        await writeVetoHotCacheEntry(req.payload, {
          siteId,
          subject: String(subject),
          vetoIds: vetoes.filter((v) => ['T04', 'C01', 'R10'].includes(v)),
          summaryExtra: wasPublished ? '已发布内容复核命中硬否决，生命周期已标记为救治队列' : undefined,
        })
      }

      if (willPublish && !wasPublished) {
        next.status = 'draft'
        const { finalOverallScore } = applyAuditorVetoTable({
          rawOverallScore: q.rawScore,
          vetoCount: vetoes.length,
        })
        next.qualityScore = finalOverallScore
        delete next._quality
        return next
      }

      if (willPublish && wasPublished) {
        next.lifecycleStage = 'dying'
        next.optimizationHistory = appendOptimizationHistory(
          next.optimizationHistory ?? (originalDoc as { optimizationHistory?: unknown } | null)?.optimizationHistory,
          {
            date: new Date().toISOString(),
            action: 'hard_veto_while_published',
            cost: 0,
            note: 'CORE hard veto on refresh — triage may merge/archive',
          },
        )
        const { finalOverallScore } = applyAuditorVetoTable({
          rawOverallScore: q.rawScore,
          vetoCount: vetoes.length,
        })
        next.qualityScore = finalOverallScore
        delete next._quality
        return next
      }
    }

    const { blocked, finalOverallScore } = applyAuditorVetoTable({
      rawOverallScore: q.rawScore,
      vetoCount: vetoes.length,
    })
    if (blocked) {
      next.status = 'draft'
    }
    next.qualityScore = finalOverallScore
  }

  delete next._quality
  return next
}
