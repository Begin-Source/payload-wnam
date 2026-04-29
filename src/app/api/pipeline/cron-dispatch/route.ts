import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import { forwardPipelinePost, pipelineOrigin, readJsonSafe } from '@/app/api/pipeline/lib/internalPipelineFetch'

export const dynamic = 'force-dynamic'

const PATH = '/api/pipeline/cron-dispatch'

/** Single-hop pipeline steps that accept `{}` POST bodies today. */
const TASK_ROUTES = {
  triage: '/api/pipeline/triage',
  anchor_audit: '/api/pipeline/anchor-audit',
  topic_cluster_audit: '/api/pipeline/topic-cluster-audit',
  internal_link_audit: '/api/pipeline/internal-link-audit',
  alert_eval: '/api/pipeline/alert-eval',
  /** Placeholder domain — replace with `primaryDomain` per site in production. */
  backlink_scan: '/api/pipeline/backlink-scan',
  domain_audit: '/api/pipeline/domain-audit',
  amazon_sync: '/api/pipeline/amazon-sync',
  meta_ab_pick: '/api/pipeline/meta-ab-pick',
  /** SEO matrix: active sites × keywords → rank-track (DataForSEO). */
  seo_matrix_rank_sync: '/api/seo-matrix/rank-sync',
} as const

export type CronDispatchTaskId = keyof typeof TASK_ROUTES

const PRESETS: Record<string, CronDispatchTaskId[]> = {
  /** Daily 03:00 lifecycle + money-page pass (see triage route). */
  daily_lifecycle: ['triage'],
  /** Weekly link hygiene placeholders (anchor / cluster / monthly internal audit). */
  weekly_link_audits: ['anchor_audit', 'topic_cluster_audit', 'internal_link_audit'],
  /** Optional LLM digest over metrics JSON (caller may extend body via per-task override later). */
  alert_digest: ['alert_eval'],
  /** 钉子 7 后半 + S6a：月度体检与联盟同步占位（DFS / Merchant 密钥就绪后生效）。 */
  monthly_ops_placeholder: ['backlink_scan', 'domain_audit', 'internal_link_audit', 'amazon_sync'],
  /** 钉子 5：A/B 冠军占位周检。 */
  weekly_meta_champion: ['meta_ab_pick'],
  /** SEO 矩阵：批量回写 rankings（受站点配额与 DFS 密钥影响）。 */
  seo_matrix_rank_pulse: ['seo_matrix_rank_sync'],
}

export async function GET(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  return Response.json({
    ok: true,
    path: PATH,
    origin: pipelineOrigin(request),
    tasks: TASK_ROUTES,
    presets: PRESETS,
    hint: 'Call POST with { "preset": "daily_lifecycle" } or { "tasks": ["triage", ...] }. Use PIPELINE_BASE_URL if self-fetch must target a public URL.',
    tickRunner:
      'POST /api/pipeline/tick?execute=1 runs one pending workflow-job (rank_track, brief_generate, draft_*, internal_link_*, …).',
  })
}

export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as {
    preset?: keyof typeof PRESETS
    tasks?: CronDispatchTaskId[]
  }

  let tasks: CronDispatchTaskId[] = []
  if (Array.isArray(body.tasks) && body.tasks.length > 0) {
    tasks = body.tasks.filter((t): t is CronDispatchTaskId => t in TASK_ROUTES)
  } else if (body.preset && PRESETS[body.preset]) {
    tasks = [...PRESETS[body.preset]]
  }

  if (tasks.length === 0) {
    return Response.json(
      {
        error: 'No tasks',
        detail:
          'Provide preset (daily_lifecycle | weekly_link_audits | alert_digest | monthly_ops_placeholder | weekly_meta_champion | seo_matrix_rank_pulse) or tasks array',
      },
      { status: 400 },
    )
  }

  const results: Record<string, { status: number; body: unknown }> = {}
  for (const id of tasks) {
    const route = TASK_ROUTES[id]
    const bodyOverrides: Record<string, unknown> =
      id === 'backlink_scan'
        ? { target: 'example.com' }
        : id === 'domain_audit'
          ? { pageUrl: 'https://example.com/', htmlExcerpt: '<html><body>placeholder</body></html>' }
          : id === 'amazon_sync'
            ? { asin: 'B0001234567' }
            : {}
    const res = await forwardPipelinePost(request, route, bodyOverrides)
    results[id] = { status: res.status, body: await readJsonSafe(res) }
  }

  return Response.json({
    ok: true,
    ran: tasks,
    results,
  })
}
