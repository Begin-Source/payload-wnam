import type { Field } from 'payload'

import { lexicalEditorWithAi } from '@/utilities/lexicalEditorWithAi'

/** Shared body for article-like and page-like content (no postType — implied by collection). */
export const postLikeFields: Field[] = [
  {
    name: 'title',
    type: 'text',
    required: true,
  },
  {
    name: 'slug',
    type: 'text',
    index: true,
  },
  {
    name: 'locale',
    type: 'select',
    required: true,
    defaultValue: 'en',
    index: true,
    options: [
      { label: '中文', value: 'zh' },
      { label: 'English', value: 'en' },
    ],
    admin: {
      description: 'URL prefix /zh/ or /en/; must be unique per site + slug.',
    },
  },
  {
    name: 'site',
    type: 'relationship',
    relationTo: 'sites',
    admin: {
      description: 'Owning site (optional while migrating legacy content).',
    },
  },
  {
    name: 'categories',
    type: 'relationship',
    relationTo: 'categories',
    hasMany: true,
  },
  {
    name: 'featuredImage',
    type: 'upload',
    relationTo: 'media',
  },
  {
    name: 'body',
    type: 'richText',
    editor: lexicalEditorWithAi(),
  },
  {
    name: 'status',
    type: 'select',
    required: true,
    defaultValue: 'draft',
    options: [
      { label: 'Draft', value: 'draft' },
      { label: 'Published', value: 'published' },
      { label: 'Archived', value: 'archived' },
    ],
  },
  {
    name: 'publishedAt',
    type: 'date',
    admin: { date: { pickerAppearance: 'dayAndTime' } },
  },
  {
    name: 'excerpt',
    type: 'textarea',
  },
]
