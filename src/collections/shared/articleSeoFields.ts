import type { Field } from 'payload'

/** Resolve numeric site id from article form `data.site` for relationship filterOptions. */
export function articleFormSiteId(data: { site?: unknown } | undefined): number | undefined {
  const raw = data?.site as { id?: number } | number | null | undefined
  const siteId =
    raw != null && typeof raw === 'object' && 'id' in raw
      ? Number((raw as { id: number }).id)
      : typeof raw === 'number'
        ? raw
        : undefined
  return siteId != null && Number.isFinite(siteId) ? siteId : undefined
}

/** Appended to post-like base fields for `articles` only (SEO pipeline + lifecycle). */
export const articleSeoFields: Field[] = [
  {
    type: 'row',
    fields: [
      { name: 'primaryKeyword', type: 'relationship', relationTo: 'keywords' },
      {
        name: 'secondaryKeywords',
        type: 'relationship',
        relationTo: 'keywords',
        hasMany: true,
      },
    ],
  },
  {
    name: 'contentTemplate',
    type: 'select',
    defaultValue: 'howto',
    options: [
      { label: 'Review', value: 'review' },
      { label: 'Comparison', value: 'comparison' },
      { label: 'How-to', value: 'howto' },
      { label: 'Listicle', value: 'listicle' },
      { label: 'Buying guide', value: 'buyingGuide' },
      { label: 'Pillar', value: 'pillar' },
    ],
  },
  { name: 'qualityScore', type: 'number', admin: { readOnly: true } },
  { name: 'eeatCheck', type: 'json', admin: { readOnly: true } },
  { name: 'schemaJsonLd', type: 'json' },
  { name: 'vetoCodes', type: 'json' },
  {
    name: 'featuredOffers',
    type: 'relationship',
    relationTo: 'offers',
    hasMany: true,
  },
  {
    name: 'author',
    type: 'relationship',
    relationTo: 'authors',
    admin: {
      description:
        'Required when status is Published (enforced in hook). Only authors assigned to this article site are listed; pick Site first.',
    },
    filterOptions: ({ data }) => {
      const siteId = articleFormSiteId(data)
      if (siteId == null) return true
      return { sites: { contains: siteId } }
    },
  },
  {
    name: 'reviewedBy',
    type: 'relationship',
    relationTo: 'authors',
    admin: {
      description: 'Optional reviewer; same site filter as Author.',
    },
    filterOptions: ({ data }) => {
      const siteId = articleFormSiteId(data)
      if (siteId == null) return true
      return { sites: { contains: siteId } }
    },
  },
  {
    name: 'originalEvidence',
    type: 'relationship',
    relationTo: 'original-evidence',
    hasMany: true,
  },
  { name: 'sourceBrief', type: 'relationship', relationTo: 'content-briefs' },
  {
    name: 'pipelineProfile',
    type: 'relationship',
    relationTo: 'pipeline-profiles',
    admin: {
      description:
        '可选。指定后本篇文章的 AI 流水线使用该配置（优先于站点默认）。用于 A/B 对照；留空则继承站点或租户默认。',
      position: 'sidebar',
    },
        filterOptions: ({ data }) => {
      const raw = (data as { tenant?: number | { id: number } | null })?.tenant
      const tid =
        raw != null && typeof raw === 'object' && 'id' in raw
          ? Number((raw as { id: number }).id)
          : typeof raw === 'number'
            ? raw
            : null
      if (tid == null || !Number.isFinite(tid)) return false
      return { tenant: { equals: tid } }
    },
  },
  {
    name: 'pipelineProfileSnapshot',
    type: 'json',
    admin: {
      readOnly: true,
      description:
        '首次入队 draft_section 时冻结的流水线合并快照（SEO A/B）。勿手改。',
    },
  },
  {
    name: 'pipelineProfileSlug',
    type: 'text',
    admin: {
      readOnly: true,
      description: '与快照对应的 pipeline profile slug（租户默认/global 时为空）。',
    },
  },
  {
    name: 'pipelineProfileSource',
    type: 'text',
    admin: {
      readOnly: true,
      description: 'Profile 解析来源：explicit | article | site | tenant_default | global_only',
    },
  },
  { name: 'mergedInto', type: 'relationship', relationTo: 'articles' },
  { name: 'sectionSummaries', type: 'json' },
  { name: 'metaVariants', type: 'json' },
  {
    name: 'lifecycleStage',
    type: 'select',
    defaultValue: 'n_a',
    options: [
      { label: 'N/A (not published to SERP track)', value: 'n_a' },
      { label: 'Probation', value: 'probation' },
      { label: 'Winner', value: 'winner' },
      { label: 'Borderline', value: 'borderline' },
      { label: 'Loser', value: 'loser' },
      { label: 'Stable watch', value: 'stable_watch' },
      { label: 'Repaired', value: 'repaired' },
      { label: 'Dying', value: 'dying' },
      { label: 'Merged', value: 'merged' },
      { label: 'Lifecycle archived', value: 'archived' },
    ],
  },
  { name: 'probationEndsAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
  { name: 'bestPosition', type: 'number' },
  { name: 'currentPosition', type: 'number' },
  { name: 'impressions30d', type: 'number' },
  { name: 'clicks30d', type: 'number' },
  { name: 'nextActionAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
  { name: 'optimizationHistory', type: 'json' },
  {
    name: 'linkBudgetWarnings',
    type: 'json',
    admin: {
      readOnly: true,
      description: 'Populated when body outlink count is in the warn band (see link budget hook).',
    },
  },
  { name: 'skipLinkBudgetCheck', type: 'checkbox', defaultValue: false },
]
