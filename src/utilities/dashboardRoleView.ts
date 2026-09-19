import type { Config } from '@/payload-types'
import { userHasAllTenantAccess } from '@/utilities/superAdmin'
import { getUserRoles } from '@/utilities/userRoles'

export type DashboardRoleView = 'executive' | 'operations' | 'finance' | 'system' | 'public'
export type DashboardWorkbenchMode = 'finance' | 'management' | 'personal' | 'public' | 'system'

export function dashboardRoleView(user: Config['user'] | null | undefined): DashboardRoleView {
  if (!user || user.collection !== 'users') return 'public'
  if (userHasAllTenantAccess(user)) return 'executive'

  const roles = getUserRoles(user)
  if (roles.includes('system-admin')) return 'system'
  if (
    roles.some((role) =>
      ['general-manager', 'ops-manager', 'team-lead', 'site-manager'].includes(role),
    )
  ) {
    return 'operations'
  }
  if (roles.includes('finance')) return 'finance'
  return 'public'
}

export function dashboardWorkbenchMode(
  user: Config['user'] | null | undefined,
  view = dashboardRoleView(user),
): DashboardWorkbenchMode {
  if (view === 'finance' || view === 'system' || view === 'public') return view
  const roles = getUserRoles(user)
  return view === 'executive' ||
    roles.some((role) => ['general-manager', 'ops-manager', 'team-lead'].includes(role))
    ? 'management'
    : 'personal'
}

export const dashboardCopy: Record<DashboardRoleView, { description: string; heading: string }> = {
  executive: {
    heading: '经营与运营总览',
    description: '汇总当前可访问范围内的运营、内容、技术和财务状态。',
  },
  operations: {
    heading: '运营总览',
    description: '仅汇总当前账号负责的网站和需要处理的运营事项。',
  },
  finance: {
    heading: '财务工作台',
    description: '显示收益导入、结算与付款事项，不加载网站点击、文章或排名数据。',
  },
  system: {
    heading: '系统运行总览',
    description: '显示站点与任务运行状态，不加载文章正文、经营金额或人员提成。',
  },
  public: {
    heading: '首页',
    description: '当前账号没有内部经营或技术工作台权限。',
  },
}
