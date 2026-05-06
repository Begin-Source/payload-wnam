import type { CollectionConfig } from 'payload'

import {
  applyWorkflowMatrixTemplate,
  guardWorkflowJobPipelineSpend,
} from '@/collections/hooks/workflowJobMatrixTemplate'
import { adminGroups } from '@/constants/adminGroups'
import { WORKFLOW_MATRIX_TEMPLATE_LABELS } from '@/constants/workflowJobMatrixTemplates'
import { siteScopedCollectionAccess } from '@/collections/access/siteScopedContentAccess'
import { validateSiteFieldWithinVisibilityScope } from '@/collections/hooks/validateSiteVisibilityScope'

export const WorkflowJobs: CollectionConfig = {
  slug: 'workflow-jobs',
  labels: { singular: '工作流任务', plural: '工作流任务' },
  admin: {
    group: adminGroups.operations,
    useAsTitle: 'label',
    defaultColumns: ['label', 'jobType', 'matrixTemplate', 'status', 'site', 'updatedAt'],
    components: {
      views: {
        list: {
          actions: ['./components/PipelineRunNextDrawer#PipelineRunNextDrawer'],
        },
      },
    },
    description:
      '矩阵模板：新建任务时可选「矩阵模板」，在 Input payload 为空时自动填入 JSON 预设（见 constants/workflowJobMatrixTemplates）。',
  },
  access: siteScopedCollectionAccess('workflow-jobs'),
  hooks: {
    beforeChange: [
      validateSiteFieldWithinVisibilityScope,
      applyWorkflowMatrixTemplate,
      guardWorkflowJobPipelineSpend,
    ],
  },
  fields: [
    {
      name: 'label',
      type: 'text',
      required: true,
    },
    {
      name: 'matrixTemplate',
      type: 'select',
      label: '矩阵模板',
      defaultValue: '',
      options: [
        { label: '— 无 —', value: '' },
        {
          label: WORKFLOW_MATRIX_TEMPLATE_LABELS.new_site_checklist,
          value: 'new_site_checklist',
        },
        {
          label: WORKFLOW_MATRIX_TEMPLATE_LABELS.bulk_keyword_sync,
          value: 'bulk_keyword_sync',
        },
        {
          label: WORKFLOW_MATRIX_TEMPLATE_LABELS.post_publish_ping,
          value: 'post_publish_ping',
        },
      ],
      admin: {
        description: '仅在新建且 Input payload 为空时写入默认 JSON（与 jobType 独立）。',
      },
    },
    {
      name: 'jobType',
      type: 'select',
      required: true,
      defaultValue: 'custom',
      options: [
        { label: 'Publish', value: 'publish' },
        { label: 'Sync', value: 'sync' },
        { label: 'AI generate', value: 'ai_generate' },
        { label: 'Custom', value: 'custom' },
        { label: 'Keyword discover', value: 'keyword_discover' },
        { label: 'Keyword cluster · SERP overlap', value: 'keyword_cluster' },
        { label: 'SERP audit', value: 'serp_audit' },
        { label: 'Brief generate', value: 'brief_generate' },
        { label: 'Draft skeleton', value: 'draft_skeleton' },
        { label: 'Draft section', value: 'draft_section' },
        { label: 'Draft finalize', value: 'draft_finalize' },
        { label: 'Image generate', value: 'image_generate' },
        { label: 'Media · Together 配图', value: 'media_image_generate' },
        { label: 'Category · Together 封面', value: 'category_cover_generate' },
        { label: 'Site · Together 首页横幅', value: 'hero_banner_generate' },
        { label: 'Site · Together Logo / 图标', value: 'site_logo_generate' },
        { label: 'Amazon sync', value: 'amazon_sync' },
        { label: 'Backlink scan', value: 'backlink_scan' },
        { label: 'Rank track', value: 'rank_track' },
        { label: 'Alert eval', value: 'alert_eval' },
        { label: 'Triage', value: 'triage' },
        { label: 'Content audit', value: 'content_audit' },
        { label: 'Content refresh', value: 'content_refresh' },
        { label: 'Content merge', value: 'content_merge' },
        { label: 'Content archive', value: 'content_archive' },
        { label: 'Meta A/B optimize', value: 'meta_ab_optimize' },
        { label: 'Internal link inject', value: 'internal_link_inject' },
        { label: 'Internal link rewrite', value: 'internal_link_rewrite' },
        { label: 'Internal link reinforce', value: 'internal_link_reinforce' },
        { label: 'Anchor rewrite', value: 'anchor_rewrite' },
        { label: 'Competitor gap', value: 'competitor_gap' },
        { label: 'Domain audit', value: 'domain_audit' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Running', value: 'running' },
        { label: 'Completed', value: 'completed' },
        { label: 'Failed', value: 'failed' },
        { label: 'Needs input', value: 'needs_input' },
        { label: 'Failed partial', value: 'failed_partial' },
      ],
    },
    {
      name: 'parentJob',
      type: 'relationship',
      relationTo: 'workflow-jobs',
      label: 'Parent job (chain)',
    },
    { name: 'skillId', type: 'text' },
    {
      name: 'contentBrief',
      type: 'relationship',
      relationTo: 'content-briefs',
    },
    {
      name: 'pipelineKeyword',
      type: 'relationship',
      relationTo: 'keywords',
    },
    {
      name: 'handoff',
      type: 'json',
      admin: {
        description: 'Handoff: status, objective, keyFindings, evidence, openLoops, recommendedNextSkill, capApplied, scores…',
      },
    },
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
    },
    {
      name: 'article',
      type: 'relationship',
      relationTo: 'articles',
      admin: {
        description: 'Optional target article for publish/AI jobs.',
      },
    },
    {
      name: 'page',
      type: 'relationship',
      relationTo: 'pages',
      admin: {
        description: 'Optional target page for publish/AI jobs.',
      },
    },
    {
      name: 'input',
      type: 'json',
      label: 'Input payload',
    },
    {
      name: 'output',
      type: 'json',
      label: 'Output / result',
    },
    {
      name: 'startedAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'completedAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'errorMessage',
      type: 'textarea',
    },
  ],
}
