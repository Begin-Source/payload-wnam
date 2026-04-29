import type { Payload } from 'payload'

import { translateVeto } from '@/utilities/vetoTranslations'

/**
 * Persists a veto-class entry to `knowledge-base` (Skill Contract hot-cache).
 */
export async function writeVetoHotCacheEntry(
  payload: Payload,
  input: {
    siteId?: string | null
    subject: string
    vetoIds: string[]
    summaryExtra?: string
  },
): Promise<void> {
  const lines = input.vetoIds.map((id) => translateVeto(id))
  const summary = [lines.join('；'), input.summaryExtra].filter(Boolean).join(' — ')
  const siteNum =
    input.siteId && /^\d+$/.test(String(input.siteId)) ? Number(input.siteId) : undefined

  await payload.create({
    collection: 'knowledge-base',
    data: {
      title: `质量闸否决 · ${input.subject}`.slice(0, 200),
      slug: `veto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'published',
      entryType: 'hot_cache',
      skillId: 'content-quality-auditor',
      subject: input.subject,
      summary,
      severity: 'veto',
      payload: { vetoIds: input.vetoIds, translated: lines },
      artifactClass: 'auditor-output',
      ...(siteNum != null && Number.isFinite(siteNum) ? { site: siteNum } : {}),
    },
  })
}
