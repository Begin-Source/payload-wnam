import type { CollectionConfig } from 'payload'

import { lexicalEditorWithAi } from '@/utilities/lexicalEditorWithAi'

import { authorsGdprValidate } from '@/collections/hooks/authorsGdprValidate'
import { authorsSitesSlugValidate } from '@/collections/hooks/authorsSitesSlugValidate'
import { adminGroups } from '@/constants/adminGroups'
import { siteScopedCollectionAccess } from '@/collections/access/siteScopedContentAccess'
import { validateAuthorsSitesWithinVisibilityScope } from '@/collections/hooks/validateSiteVisibilityScope'

export const Authors: CollectionConfig = {
  slug: 'authors',
  labels: { singular: '作者', plural: '作者' },
  admin: {
    group: adminGroups.website,
    useAsTitle: 'displayName',
    defaultColumns: ['displayName', 'sites', 'role', 'updatedAt'],
  },
  access: siteScopedCollectionAccess('authors', 'authors'),
  hooks: {
    beforeValidate: [authorsGdprValidate, authorsSitesSlugValidate],
    beforeChange: [validateAuthorsSitesWithinVisibilityScope],
  },
  fields: [
    { name: 'displayName', type: 'text', required: true, index: true },
    {
      name: 'slug',
      type: 'text',
      index: true,
      admin: {
        description:
          'Unique among authors that share a site with this record; two authors on disjoint sites may reuse the same slug.',
      },
    },
    {
      name: 'sites',
      type: 'relationship',
      relationTo: 'sites',
      hasMany: true,
      required: true,
      admin: {
        description:
          'Sites where this byline may appear. Articles only list authors whose sites include the article site.',
      },
    },
    {
      name: 'role',
      type: 'select',
      defaultValue: 'editor',
      options: [
        { label: 'Editor', value: 'editor' },
        { label: 'Reviewer', value: 'reviewer' },
        { label: 'Expert', value: 'expert' },
        { label: 'Contributor', value: 'contributor' },
      ],
    },
    { name: 'headshot', type: 'upload', relationTo: 'media' },
    { name: 'bioLexical', type: 'richText', editor: lexicalEditorWithAi() },
    {
      name: 'credentials',
      type: 'json',
      admin: {
        description: '[{ title, issuer?, year?, verifyUrl? }] — json for simpler D1 migrations',
      },
    },
    {
      name: 'expertiseAreas',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
    },
    { name: 'sameAs', type: 'json', admin: { description: '[{ url }]' } },
    { name: 'schemaPersonJsonLd', type: 'json' },
    {
      name: 'gdprLawfulBasis',
      type: 'select',
      defaultValue: 'not_applicable',
      options: [
        { label: 'Consent', value: 'consent' },
        { label: 'Legitimate interest', value: 'legitimate_interest' },
        { label: 'Contract', value: 'contract' },
        { label: 'Other', value: 'other' },
        { label: 'N/A', value: 'not_applicable' },
      ],
    },
    {
      name: 'gdprRegion',
      type: 'select',
      defaultValue: 'other',
      options: [
        { label: 'EU', value: 'eu' },
        { label: 'EEA', value: 'eea' },
        { label: 'UK', value: 'uk' },
        { label: 'US', value: 'us' },
        { label: 'Other', value: 'other' },
      ],
    },
  ],
}
