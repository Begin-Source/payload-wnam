import type { CollectionAfterChangeHook } from 'payload'

import { appendAuditLog } from '@/utilities/auditLogAppend'
import { relationId } from '@/utilities/publicLandingTheme'
import { isUsersCollection } from '@/utilities/announcementAccess'

function portfolioFingerprint(doc: Record<string, unknown>): string | null {
  const p = doc.portfolio
  const id = relationId(p)
  return id != null ? String(id) : null
}

/** Audit trail for matrix-relevant `sites` changes (status / portfolio). */
export const auditSitesMatrixChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  const payload = req.payload
  const actorId = isUsersCollection(req.user) ? req.user.id : null
  const d = doc as Record<string, unknown>
  const id = String(d.id ?? '')

  if (operation === 'create') {
    await appendAuditLog(payload, {
      action: 'sites.create',
      collectionSlug: 'sites',
      documentId: id,
      actorId,
      metadata: {
        matrix: true,
        status: d.status,
        portfolioId: portfolioFingerprint(d),
      },
    })
    return
  }

  if (operation !== 'update' || !previousDoc || typeof previousDoc !== 'object') return

  const prev = previousDoc as Record<string, unknown>
  const statusChanged = prev.status !== d.status
  const portfolioChanged = portfolioFingerprint(prev) !== portfolioFingerprint(d)
  if (!statusChanged && !portfolioChanged) return

  await appendAuditLog(payload, {
    action: 'sites.update.matrix',
    collectionSlug: 'sites',
    documentId: id,
    actorId,
    metadata: {
      matrix: true,
      statusBefore: prev.status,
      statusAfter: d.status,
      portfolioBefore: portfolioFingerprint(prev),
      portfolioAfter: portfolioFingerprint(d),
    },
  })
}
