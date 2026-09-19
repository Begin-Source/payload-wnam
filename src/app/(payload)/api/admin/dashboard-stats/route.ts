import configPromise from '@payload-config'
import type { Where } from 'payload'
import { getPayload } from 'payload'

import type { Config } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'
import {
  dashboardCopy,
  dashboardRoleView,
  type DashboardRoleView,
} from '@/utilities/dashboardRoleView'

export const dynamic = 'force-dynamic'

type CountCollection =
  | 'affiliate-earnings-imports'
  | 'articles'
  | 'click-events'
  | 'commission-statements'
  | 'commissions'
  | 'keywords'
  | 'pages'
  | 'rankings'
  | 'sites'
  | 'workflow-jobs'

type MetricSpec = {
  collection: CountCollection
  key: string
  label: string
  where?: Where
}

const publishedWhere: Where = { status: { equals: 'published' } }
const activeWorkflowWhere: Where = {
  or: [{ status: { equals: 'pending' } }, { status: { equals: 'running' } }],
}
const failedWorkflowWhere: Where = {
  status: { in: ['failed', 'failed_partial', 'needs_input'] },
}

const metricSpecs: Record<DashboardRoleView, MetricSpec[]> = {
  executive: [
    { key: 'sites', label: '站点总数', collection: 'sites' },
    {
      key: 'sitesActive',
      label: '运行中站点',
      collection: 'sites',
      where: { status: { equals: 'active' } },
    },
    {
      key: 'clicks',
      label: '点击',
      collection: 'click-events',
      where: { eventType: { equals: 'click' } },
    },
    {
      key: 'articlesPublished',
      label: '已发布文章',
      collection: 'articles',
      where: publishedWhere,
    },
    { key: 'pagesPublished', label: '已发布页面', collection: 'pages', where: publishedWhere },
    {
      key: 'workflowActive',
      label: '执行中任务',
      collection: 'workflow-jobs',
      where: activeWorkflowWhere,
    },
    {
      key: 'workflowAttention',
      label: '异常／待输入',
      collection: 'workflow-jobs',
      where: failedWorkflowWhere,
    },
    { key: 'keywords', label: '关键词', collection: 'keywords' },
    { key: 'commissions', label: '佣金记录', collection: 'commissions' },
    { key: 'rankings', label: '排名快照', collection: 'rankings' },
  ],
  operations: [
    { key: 'sites', label: '负责站点', collection: 'sites' },
    {
      key: 'sitesActive',
      label: '运行中站点',
      collection: 'sites',
      where: { status: { equals: 'active' } },
    },
    {
      key: 'clicks',
      label: '点击',
      collection: 'click-events',
      where: { eventType: { equals: 'click' } },
    },
    {
      key: 'articlesPublished',
      label: '已发布文章',
      collection: 'articles',
      where: publishedWhere,
    },
    {
      key: 'workflowActive',
      label: '执行中任务',
      collection: 'workflow-jobs',
      where: activeWorkflowWhere,
    },
    {
      key: 'workflowAttention',
      label: '异常／待输入',
      collection: 'workflow-jobs',
      where: failedWorkflowWhere,
    },
    { key: 'keywords', label: '关键词', collection: 'keywords' },
    { key: 'rankings', label: '排名快照', collection: 'rankings' },
  ],
  finance: [
    { key: 'earningsImports', label: '收益导入', collection: 'affiliate-earnings-imports' },
    { key: 'commissions', label: '佣金明细', collection: 'commissions' },
    {
      key: 'statementsDraft',
      label: '待核算结算单',
      collection: 'commission-statements',
      where: { status: { equals: 'draft' } },
    },
    {
      key: 'statementsApproved',
      label: '待付款',
      collection: 'commission-statements',
      where: { status: { equals: 'approved' } },
    },
    {
      key: 'statementsPaid',
      label: '已付款',
      collection: 'commission-statements',
      where: { status: { equals: 'paid' } },
    },
  ],
  system: [
    { key: 'sites', label: '站点总数', collection: 'sites' },
    {
      key: 'sitesActive',
      label: '运行中站点',
      collection: 'sites',
      where: { status: { equals: 'active' } },
    },
    {
      key: 'workflowActive',
      label: '执行中任务',
      collection: 'workflow-jobs',
      where: activeWorkflowWhere,
    },
    {
      key: 'workflowAttention',
      label: '故障／待输入',
      collection: 'workflow-jobs',
      where: failedWorkflowWhere,
    },
  ],
  public: [],
}

async function countForUser(
  payload: Awaited<ReturnType<typeof getPayload>>,
  user: Config['user'] & { collection: 'users' },
  spec: MetricSpec,
): Promise<{ key: string; label: string; value: number }> {
  const result = await payload.count({
    collection: spec.collection,
    where: spec.where,
    user,
    overrideAccess: false,
  })
  return { key: spec.key, label: spec.label, value: result.totalDocs }
}

export async function GET(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userArg = user as Config['user'] & { collection: 'users' }
  const view = dashboardRoleView(userArg)
  const metrics = await Promise.all(
    metricSpecs[view].map((spec) => countForUser(payload, userArg, spec)),
  )

  return Response.json({ view, ...dashboardCopy[view], metrics })
}
