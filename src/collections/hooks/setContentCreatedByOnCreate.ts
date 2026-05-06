import type { CollectionBeforeChangeHook } from 'payload'

import { isUsersCollection } from '@/utilities/announcementAccess'

/**
 * Create: actor `users` → set `createdBy` to that user.
 * Update: preserve `createdBy` from original (attribution for AI cost / commission).
 */
export const setContentCreatedByOnCreate: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const user = req.user

  if (operation === 'create' && isUsersCollection(user)) {
    return {
      ...data,
      createdBy: user.id,
    }
  }

  if (operation === 'update' && originalDoc) {
    const prev = (originalDoc as { createdBy?: unknown }).createdBy
    return {
      ...data,
      createdBy: prev ?? null,
    }
  }

  return data
}
