import type { CollectionBeforeChangeHook } from 'payload'

import { isUsersCollection } from '@/utilities/announcementAccess'

/**
 * Create: when the actor is a `users` document, always set `createdBy` to that user (ignores client/API values).
 * Update: always restore `createdBy` from `originalDoc` so it cannot be changed via API.
 */
export const setSitesCreatedByOnCreate: CollectionBeforeChangeHook = ({
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
