import type { Access, CollectionConfig, Where } from 'payload'

import { recomputeCommissionStatementHook } from '@/collections/hooks/recomputeCommissionStatement'
import { adminGroups } from '@/constants/adminGroups'
import { isUsersCollection } from '@/utilities/announcementAccess'
import {
  userIsFinanceManagerOnly,
  userMayWriteCommissions,
} from '@/utilities/financeRoleAccess'
import { superAdminOrTenantGMPasses } from '@/utilities/superAdminPasses'
import { getTenantScopeForStats } from '@/utilities/tenantScope'
import { tenantWideContentPasses } from '@/utilities/tenantWideContentPasses'
import { denyPortalAndFinanceCollection } from '@/utilities/userAccessTiers'
import { userHasRole } from '@/utilities/userRoles'

function impossibleWhere(): Where {
  return { id: { equals: 0 } }
}

const financeWrites: Access = superAdminOrTenantGMPasses(({ req: { user } }) => userMayWriteCommissions(user))

/** Tenant-scoped reads (multi-tenant `tenant` on doc); finance-only users see all assigned finance collections. */
const financeImportsRowsRead: Access = tenantWideContentPasses(async ({ req }) => {
  const { user } = req
  if (!user || !isUsersCollection(user)) return false
  if (userIsFinanceManagerOnly(user)) return true
  const scope = getTenantScopeForStats(user)
  if (scope.mode === 'all') return true
  if (scope.mode === 'none') return impossibleWhere()
  return { tenant: { in: scope.tenantIds } }
})

function statementReadWhere(user: unknown): Where | boolean {
  if (!isUsersCollection(user)) return false
  const uid = user.id
  if (
    userHasRole(user, 'finance') ||
    userHasRole(user, 'general-manager') ||
    userHasRole(user, 'super-admin')
  ) {
    return true
  }
  if (userHasRole(user, 'team-lead') || userHasRole(user, 'ops-manager') || userHasRole(user, 'site-manager')) {
    return {
      or: [{ recipient: { equals: uid } }, { sourceEmployee: { equals: uid } }],
    }
  }
  return impossibleWhere()
}

const statementsRead: Access = denyPortalAndFinanceCollection(
  'commission-statements',
  tenantWideContentPasses(({ req: { user } }) => statementReadWhere(user)),
)

export const AffiliateEarningsImports: CollectionConfig = {
  slug: 'affiliate-earnings-imports',
  labels: { singular: '联盟收益导入', plural: '联盟收益导入' },
  admin: {
    group: adminGroups.finance,
    useAsTitle: 'fileName',
    defaultColumns: ['fileName', 'periodStart', 'periodEnd', 'rowsCount', 'grossEarningsUsd', 'updatedAt'],
    description:
      'Amazon Associates CSV 汇总头；明细见「联盟收益行」。批量报表请在列表页右上角三点菜单打开「Amazon 报表导入」。',
    components: {
      beforeListTable: ['./components/AffiliateEarningsImportPanel#AffiliateEarningsImportPanel'],
      listMenuItems: ['./components/AffiliateEarningsImportPanel#AffiliateEarningsImportListMenuItem'],
    },
  },
  access: {
    read: denyPortalAndFinanceCollection('affiliate-earnings-imports', financeImportsRowsRead),
    create: denyPortalAndFinanceCollection('affiliate-earnings-imports', financeWrites),
    update: denyPortalAndFinanceCollection('affiliate-earnings-imports', financeWrites),
    delete: denyPortalAndFinanceCollection('affiliate-earnings-imports', financeWrites),
  },
  fields: [
    {
      name: 'source',
      type: 'select',
      defaultValue: 'amazon_associates',
      options: [{ label: 'Amazon Associates', value: 'amazon_associates' }],
    },
    {
      name: 'periodStart',
      type: 'date',
      required: true,
      admin: { date: { pickerAppearance: 'dayOnly' } },
    },
    {
      name: 'periodEnd',
      type: 'date',
      required: true,
      admin: { date: { pickerAppearance: 'dayOnly' } },
    },
    {
      name: 'fileName',
      type: 'text',
      label: '文件名',
    },
    {
      name: 'rowsCount',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'grossEarningsUsd',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true, step: 0.01 },
    },
    {
      name: 'importedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true },
    },
    {
      name: 'notes',
      type: 'textarea',
    },
    {
      name: 'rawSummaryJson',
      type: 'textarea',
      admin: { readOnly: true, rows: 4 },
    },
  ],
}

export const AffiliateEarningsRows: CollectionConfig = {
  slug: 'affiliate-earnings-rows',
  labels: { singular: '联盟收益行', plural: '联盟收益行' },
  admin: {
    group: adminGroups.finance,
    useAsTitle: 'trackingId',
    defaultColumns: [
      'trackingId',
      'recipient',
      'periodStart',
      'periodEnd',
      'totalEarningsUsd',
      'clicks',
      'updatedAt',
    ],
    description: '按 Tracking ID 聚合的一行；用于分成结算。',
  },
  access: {
    read: denyPortalAndFinanceCollection('affiliate-earnings-rows', financeImportsRowsRead),
    create: denyPortalAndFinanceCollection('affiliate-earnings-rows', financeWrites),
    update: denyPortalAndFinanceCollection('affiliate-earnings-rows', financeWrites),
    delete: denyPortalAndFinanceCollection('affiliate-earnings-rows', financeWrites),
  },
  fields: [
    {
      name: 'batch',
      type: 'relationship',
      relationTo: 'affiliate-earnings-imports',
      required: true,
      label: '导入批次',
    },
    {
      name: 'trackingId',
      type: 'text',
      required: true,
      index: true,
      label: 'Tracking Id',
    },
    {
      name: 'recipient',
      type: 'relationship',
      relationTo: 'users',
      label: '归属员工',
      admin: {
        description: '由 Tracking Id 匹配 users.amazonTrackingId；未匹配时留空。',
      },
    },
    {
      name: 'clicks',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'itemsOrdered',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'orderedRevenueUsd',
      type: 'number',
      admin: { step: 0.01 },
    },
    {
      name: 'itemsShipped',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'itemsReturned',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'shippedRevenueUsd',
      type: 'number',
      admin: { step: 0.01 },
    },
    {
      name: 'returnedRevenueUsd',
      type: 'number',
      admin: { step: 0.01 },
    },
    {
      name: 'totalEarningsUsd',
      type: 'number',
      admin: { step: 0.01 },
    },
    {
      name: 'bonusUsd',
      type: 'number',
      admin: { step: 0.01 },
    },
    {
      name: 'shippedEarningsUsd',
      type: 'number',
      admin: { step: 0.01 },
    },
    {
      name: 'returnedEarningsUsd',
      type: 'number',
      admin: { step: 0.01 },
    },
    {
      name: 'periodStart',
      type: 'date',
      required: true,
      admin: { date: { pickerAppearance: 'dayOnly' } },
    },
    {
      name: 'periodEnd',
      type: 'date',
      required: true,
      admin: { date: { pickerAppearance: 'dayOnly' } },
    },
    {
      name: 'rawJson',
      type: 'textarea',
      admin: { readOnly: true, rows: 3 },
    },
  ],
}

export const CommissionStatements: CollectionConfig = {
  slug: 'commission-statements',
  labels: { singular: '分成结算单', plural: '分成结算单' },
  admin: {
    group: adminGroups.finance,
    useAsTitle: 'id',
    defaultColumns: [
      'kind',
      'recipient',
      'sourceEmployee',
      'periodStart',
      'periodEnd',
      'payoutAmountUsd',
      'status',
      'updatedAt',
    ],
    description: '员工本人 / 组长抽成 / 运营抽成；由期间聚合生成。',
  },
  hooks: {
    beforeChange: [recomputeCommissionStatementHook],
  },
  access: {
    read: statementsRead,
    create: denyPortalAndFinanceCollection('commission-statements', financeWrites),
    update: denyPortalAndFinanceCollection('commission-statements', financeWrites),
    delete: denyPortalAndFinanceCollection('commission-statements', financeWrites),
  },
  fields: [
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: [
        { label: '员工本人', value: 'employee' },
        { label: '组长抽成', value: 'leader_cut' },
        { label: '运营经理抽成', value: 'ops_cut' },
      ],
    },
    {
      name: 'recipient',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      label: '收款人',
    },
    {
      name: 'sourceEmployee',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      label: '收入来源员工',
    },
    {
      name: 'periodStart',
      type: 'date',
      required: true,
      admin: { date: { pickerAppearance: 'dayOnly' } },
    },
    {
      name: 'periodEnd',
      type: 'date',
      required: true,
      admin: { date: { pickerAppearance: 'dayOnly' } },
    },
    {
      name: 'grossEarningsUsd',
      type: 'number',
      admin: { readOnly: true, step: 0.01 },
    },
    {
      name: 'aiCostsUsd',
      type: 'number',
      admin: { readOnly: true, step: 0.01 },
    },
    {
      name: 'adjustmentsUsd',
      type: 'number',
      defaultValue: 0,
      admin: { step: 0.01, description: '手工调整（可负）；仅 kind=employee 时参与计算。' },
    },
    {
      name: 'netProfitUsd',
      type: 'number',
      admin: { readOnly: true, step: 0.01 },
    },
    {
      name: 'pctApplied',
      type: 'number',
      admin: { readOnly: true, description: '结算使用的百分比。' },
    },
    {
      name: 'payoutAmountUsd',
      type: 'number',
      admin: { readOnly: true, step: 0.01 },
    },
    {
      name: 'lines',
      type: 'json',
      admin: { readOnly: true },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Approved', value: 'approved' },
        { label: 'Paid', value: 'paid' },
      ],
    },
    {
      name: 'paidAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'paymentRef',
      type: 'text',
    },
    {
      name: 'notes',
      type: 'textarea',
    },
  ],
}
