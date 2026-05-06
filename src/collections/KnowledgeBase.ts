import type { CollectionConfig } from 'payload'

import { lexicalEditorWithAi } from '@/utilities/lexicalEditorWithAi'

import { adminGroups } from '@/constants/adminGroups'
import { siteScopedCollectionAccess } from '@/collections/access/siteScopedContentAccess'
import { validateSiteFieldWithinVisibilityScope } from '@/collections/hooks/validateSiteVisibilityScope'

export const KnowledgeBase: CollectionConfig = {
  slug: 'knowledge-base',
  labels: { singular: '编辑文档', plural: '编辑文档' },
  admin: {
    group: adminGroups.knowledge,
    useAsTitle: 'title',
    defaultColumns: ['title', 'site', 'status', 'updatedAt'],
    components: {
      beforeListTable: [
        './components/ArticleFindReplacePanel#FindReplacePanel',
        './components/ArticleCsvImportExport#CsvImportExportPanel',
      ],
      listMenuItems: [
        './components/ArticleFindReplacePanel#FindReplaceListMenuItem',
        './components/ArticleCsvImportExport#CsvImportExportListMenuItem',
      ],
    },
  },
  access: siteScopedCollectionAccess('knowledge-base'),
  hooks: {
    beforeChange: [validateSiteFieldWithinVisibilityScope],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', index: true },
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      admin: { description: 'Optional scope to one site.' },
    },
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
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
    { name: 'notes', type: 'textarea' },
    {
      name: 'entryType',
      type: 'select',
      options: [
        { label: 'Research', value: 'research' },
        { label: 'Audit', value: 'audit' },
        { label: 'Monitoring', value: 'monitoring' },
        { label: 'Decision', value: 'decision' },
        { label: 'Open loop', value: 'open_loop' },
        { label: 'Hot cache', value: 'hot_cache' },
      ],
    },
    { name: 'skillId', type: 'text' },
    { name: 'subject', type: 'text', index: true },
    { name: 'summary', type: 'textarea' },
    { name: 'payload', type: 'json' },
    {
      name: 'severity',
      type: 'select',
      defaultValue: 'info',
      options: [
        { label: 'Info', value: 'info' },
        { label: 'Warning', value: 'warn' },
        { label: 'Veto', value: 'veto' },
      ],
    },
    { name: 'expiresAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'artifactClass', type: 'text' },
  ],
}
