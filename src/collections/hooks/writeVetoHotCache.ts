import type { Payload } from 'payload'

import { translateVeto } from '@/utilities/vetoTranslations'
import { optionalSiteContext, requireLocalSiteId } from '@/site-runtime/context'

/**
 * Persists a veto-class entry to `knowledge-base` (Skill Contract hot-cache).
 */
export async function writeVetoHotCacheEntry(
  payload: Payload,
  input: {
    /** Local numeric sites.id (or its serialized value), never the registry siteId. */
    siteId?: number | string | null
    subject: string
    vetoIds: string[]
    summaryExtra?: string
  },
): Promise<void> {
  const lines = input.vetoIds.map((id) => translateVeto(id))
  const summary = [lines.join('；'), input.summaryExtra].filter(Boolean).join(' — ')
  let siteNum = input.siteId != null && /^[1-9][0-9]*$/.test(String(input.siteId)) ? Number(input.siteId) : undefined
  if (siteNum !== undefined && !Number.isSafeInteger(siteNum)) siteNum = undefined
  if (optionalSiteContext()?.localSiteId !== undefined) {
    const localSiteId = requireLocalSiteId()
    if (input.siteId != null && siteNum !== localSiteId) throw new Error('Quality record site mapping mismatch')
    siteNum = localSiteId
  }

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
      ...(siteNum != null ? { site: siteNum } : {}),
    },
  })
}
