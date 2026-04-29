import type { Payload } from 'payload'

export async function appendAuditLog(
  payload: Payload,
  args: {
    action: string
    collectionSlug?: string
    documentId?: string
    actorId?: number | null
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  try {
    await payload.create({
      collection: 'audit-logs',
      data: {
        action: args.action,
        collectionSlug: args.collectionSlug,
        documentId: args.documentId,
        occurredAt: new Date().toISOString(),
        ...(args.actorId != null ? { actor: args.actorId } : {}),
        ...(args.metadata ? { metadata: args.metadata } : {}),
      },
      overrideAccess: true,
    })
  } catch {
    /* non-fatal */
  }
}
