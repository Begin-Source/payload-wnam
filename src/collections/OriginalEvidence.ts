import type { CollectionConfig } from 'payload'

import { adminGroups } from '@/constants/adminGroups'
import { loggedInSuperAdminAccessFor } from '@/collections/shared/loggedInSuperAdminAccess'

export const OriginalEvidence: CollectionConfig = {
  slug: 'original-evidence',
  labels: { singular: '原创证据', plural: '原创证据' },
  admin: {
    group: adminGroups.website,
    useAsTitle: 'id',
    defaultColumns: ['kind', 'article', 'capturedAt', 'updatedAt'],
  },
  access: loggedInSuperAdminAccessFor('original-evidence'),
  fields: [
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: [
        { label: 'Receipt', value: 'receipt' },
        { label: 'Unboxing', value: 'unboxing' },
        { label: 'Benchmark', value: 'benchmark' },
        { label: 'Hands-on photo', value: 'hands_on_photo' },
        { label: 'Screenshot', value: 'screenshot' },
        { label: 'Video frame', value: 'video_frame' },
      ],
    },
    { name: 'product', type: 'relationship', relationTo: 'offers' },
    { name: 'article', type: 'relationship', relationTo: 'articles' },
    { name: 'capturedAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'capturedBy', type: 'relationship', relationTo: 'users' },
    { name: 'media', type: 'upload', relationTo: 'media', required: true },
    { name: 'watermarkApplied', type: 'checkbox', defaultValue: false },
    { name: 'exifPreserved', type: 'checkbox', defaultValue: true },
    { name: 'notes', type: 'textarea' },
    { name: 'verifiedBy', type: 'relationship', relationTo: 'users' },
  ],
}
