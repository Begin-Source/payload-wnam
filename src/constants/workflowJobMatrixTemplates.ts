/**
 * Matrix-oriented presets for `workflow-jobs.input` JSON.
 * Selecting a template in Admin merges these defaults when `input` is empty or only has matrixTemplate.
 */

export const WORKFLOW_MATRIX_TEMPLATE_IDS = [
  '',
  'new_site_checklist',
  'bulk_keyword_sync',
  'post_publish_ping',
] as const

export type WorkflowMatrixTemplateId = (typeof WORKFLOW_MATRIX_TEMPLATE_IDS)[number]

export const WORKFLOW_MATRIX_TEMPLATE_LABELS: Record<
  Exclude<WorkflowMatrixTemplateId, ''>,
  string
> = {
  new_site_checklist: '新建站点检查清单',
  bulk_keyword_sync: '批量同步关键词（占位 handoff）',
  post_publish_ping: '发布后 Ping / 索引通知（占位）',
}

/** Default `input` payload per template (automation steps still use workflow plugin + job runner). */
export function defaultInputForMatrixTemplate(
  id: Exclude<WorkflowMatrixTemplateId, ''>,
): Record<string, unknown> {
  switch (id) {
    case 'new_site_checklist':
      return {
        matrixTemplate: id,
        checklist: [
          'verify_primary_domain_dns',
          'set_site_status_active',
          'attach_blueprint',
          'seed_default_categories',
          'submit_sitemap_to_gsc',
        ],
        notes: '矩阵：新站上线前检查；逐步用 HTTP / 文档步骤替换为真实自动化。',
      }
    case 'bulk_keyword_sync':
      return {
        matrixTemplate: id,
        source: 'keywords_collection',
        mode: 'incremental',
        maxPerSite: 200,
        notes: '矩阵：从关键词集合同步到各站；实际抓取由 pipeline / MCP 触发。',
      }
    case 'post_publish_ping':
      return {
        matrixTemplate: id,
        endpoints: ['https://www.google.com/ping?sitemap={sitemapUrl}'],
        notes: '矩阵：发布后通知；{sitemapUrl} 由运行时替换。',
      }
    default:
      return { matrixTemplate: id }
  }
}
