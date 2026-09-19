import configPromise from '@payload-config'
import type { Where } from 'payload'
import { getPayload } from 'payload'

import type { Config } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'
import {
  dashboardRoleView,
  dashboardWorkbenchMode,
  type DashboardRoleView,
  type DashboardWorkbenchMode,
} from '@/utilities/dashboardRoleView'

export const dynamic = 'force-dynamic'

type WorkbenchCollection =
  | 'commission-statements'
  | 'knowledge-base'
  | 'site-blueprints'
  | 'workflow-jobs'

type WorkbenchItem = {
  id: string
  source: WorkbenchCollection
  sourceLabel: string
  title: string
  target: string
  kind: 'completed' | 'exception' | 'review' | 'settlement'
  priority: 'high' | 'medium' | 'low'
  status: string
  summary: string
  nextAction: string
  updatedAt: string
  href: string
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const number = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

function relationLabel(value: unknown, fallback: string): string {
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>
    return text(row.name) || text(row.email) || text(row.title) || fallback
  }
  return value == null ? fallback : `${fallback} #${String(value)}`
}

function updatedAt(row: Record<string, unknown>): string {
  return text(row.updatedAt) || text(row.completedAt) || new Date(0).toISOString()
}

function clipped(value: unknown, limit = 240): string {
  const raw = text(value).trim()
  return raw.length > limit ? `${raw.slice(0, limit - 1)}…` : raw
}

async function findRows(
  payload: Awaited<ReturnType<typeof getPayload>>,
  user: Config['user'] & { collection: 'users' },
  collection: WorkbenchCollection,
  where: Where,
  limit = 100,
): Promise<Record<string, unknown>[]> {
  const result = await payload.find({
    collection,
    where,
    depth: 1,
    limit,
    sort: '-updatedAt',
    user,
    overrideAccess: false,
  })
  return result.docs as unknown as Record<string, unknown>[]
}

function workflowItem(row: Record<string, unknown>, view: DashboardRoleView): WorkbenchItem {
  const id = String(row.id)
  const status = text(row.status)
  const completed = status === 'completed'
  const systemView = view === 'system'
  const title = systemView ? `工作流任务 #${id}` : text(row.label) || `工作流任务 #${id}`
  const error = systemView ? text(row.errorCode) : clipped(row.errorMessage) || text(row.errorCode)
  return {
    id: `workflow-jobs:${id}`,
    source: 'workflow-jobs',
    sourceLabel: '工作流',
    title,
    target: relationLabel(row.site, '未指定站点'),
    kind: completed ? 'completed' : status === 'needs_input' ? 'review' : 'exception',
    priority: completed ? 'low' : status === 'failed' ? 'high' : 'medium',
    status,
    summary: error || (completed ? '任务已完成并写入结果。' : '任务需要人工检查。'),
    nextAction: completed
      ? '核验结果'
      : status === 'needs_input'
        ? '补充输入后继续'
        : '检查错误并决定是否重试',
    updatedAt: updatedAt(row),
    href: `/admin/collections/workflow-jobs/${id}`,
  }
}

function designItem(row: Record<string, unknown>, view: DashboardRoleView): WorkbenchItem {
  const id = String(row.id)
  const systemView = view === 'system'
  return {
    id: `site-blueprints:${id}`,
    source: 'site-blueprints',
    sourceLabel: '设计',
    title: systemView ? `设计任务 #${id}` : text(row.name) || `设计任务 #${id}`,
    target: relationLabel(row.site, '未指定站点'),
    kind: 'exception',
    priority: 'high',
    status: text(row.designWorkflowStatus) || 'error',
    summary: systemView
      ? text(row.designWorkflowLastErrorCode) || '设计任务失败。'
      : clipped(row.designWorkflowLastErrorDetail) ||
        clipped(row.designWorkflowLog) ||
        text(row.designWorkflowLastErrorCode) ||
        '设计任务失败。',
    nextAction: '查看失败原因并决定是否重新生成',
    updatedAt: updatedAt(row),
    href: `/admin/collections/site-blueprints/${id}`,
  }
}

function knowledgeItem(row: Record<string, unknown>): WorkbenchItem {
  const id = String(row.id)
  const severity = text(row.severity)
  return {
    id: `knowledge-base:${id}`,
    source: 'knowledge-base',
    sourceLabel: '知识库',
    title: text(row.title) || `知识事项 #${id}`,
    target: relationLabel(row.site, '共享知识'),
    kind: 'review',
    priority: severity === 'veto' ? 'high' : 'medium',
    status: text(row.entryType) || severity || 'open_loop',
    summary: clipped(row.summary) || clipped(row.notes) || '知识条目需要核实或补充来源。',
    nextAction: '核实来源并更新知识状态',
    updatedAt: updatedAt(row),
    href: `/admin/collections/knowledge-base/${id}`,
  }
}

function statementItem(row: Record<string, unknown>): WorkbenchItem {
  const id = String(row.id)
  const status = text(row.status)
  const amount = number(row.payoutAmountUsd).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
  const recipient = relationLabel(row.recipient, '未指定收款人')
  const period = [text(row.periodStart).slice(0, 10), text(row.periodEnd).slice(0, 10)]
    .filter(Boolean)
    .join(' – ')
  return {
    id: `commission-statements:${id}`,
    source: 'commission-statements',
    sourceLabel: '人员结算',
    title: `${recipient} · ${amount}`,
    target: period || '未指定结算期',
    kind: status === 'paid' ? 'completed' : 'settlement',
    priority: status === 'approved' ? 'high' : status === 'draft' ? 'medium' : 'low',
    status,
    summary: `来源人员：${relationLabel(row.sourceEmployee, '未指定')}；应付金额 ${amount}。`,
    nextAction:
      status === 'draft'
        ? '核对金额并批准'
        : status === 'approved'
          ? '登记付款结果'
          : '查看付款凭据',
    updatedAt: updatedAt(row),
    href: `/admin/collections/commission-statements/${id}`,
  }
}

async function itemsForView(
  payload: Awaited<ReturnType<typeof getPayload>>,
  user: Config['user'] & { collection: 'users' },
  view: DashboardRoleView,
  mode: DashboardWorkbenchMode,
): Promise<WorkbenchItem[]> {
  if (view === 'public') return []
  if (view === 'finance') {
    const statements = await findRows(payload, user, 'commission-statements', {
      status: { in: ['draft', 'approved', 'paid'] },
    })
    return statements.map(statementItem)
  }

  const managerView = mode === 'management'
  const workflowStatuses =
    view === 'system' || managerView
      ? ['failed', 'failed_partial']
      : ['failed', 'failed_partial', 'needs_input', 'completed']
  const requests: Promise<Record<string, unknown>[]>[] = [
    findRows(payload, user, 'workflow-jobs', { status: { in: workflowStatuses } }),
    findRows(payload, user, 'site-blueprints', { designWorkflowStatus: { equals: 'error' } }),
  ]
  if (view !== 'system') {
    requests.push(
      findRows(payload, user, 'knowledge-base', {
        or: [
          { severity: { in: managerView ? ['veto'] : ['warn', 'veto'] } },
          ...(managerView ? [] : [{ entryType: { equals: 'open_loop' } }]),
        ],
      }),
    )
  }
  const [workflows, designs, knowledge = []] = await Promise.all(requests)
  return [
    ...workflows.map((row) => workflowItem(row, view)),
    ...designs.map((row) => designItem(row, view)),
    ...knowledge.map(knowledgeItem),
  ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function GET(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userArg = user as Config['user'] & { collection: 'users' }
  const view = dashboardRoleView(userArg)
  const mode = dashboardWorkbenchMode(userArg, view)
  const items = await itemsForView(payload, userArg, view, mode)
  return Response.json({ view, mode, items })
}
