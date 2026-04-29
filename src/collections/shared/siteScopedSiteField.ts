import type { CollectionBeforeChangeHook, Field, FilterOptions } from 'payload'

import type { Config } from '@/payload-types'
import { combineTenantWhere, getTenantScopeForStats } from '@/utilities/tenantScope'
import { hasRelationshipId } from '@/utilities/parseRelationshipId'

/** 限制可选站点为当前用户租户范围内的 sites（超管为全部）。 */
export const sitesRelationshipFilterOptions: FilterOptions = ({ req }) => {
  const user = req.user
  if (!user || user.collection !== 'users') return true
  const scope = getTenantScopeForStats(user as Config['user'] & { collection: 'users' })
  const where = combineTenantWhere(scope)
  return where ?? true
}

function dataHasSiteId(data: Record<string, unknown>): boolean {
  return hasRelationshipId(data.site)
}

/**
 * 新建必须选择站点；更新不强制（便于历史数据补全或部分更新）。
 */
export const requireSiteOnCreate: CollectionBeforeChangeHook = ({ data, operation }) => {
  if (operation === 'create' && !dataHasSiteId(data as Record<string, unknown>)) {
    throw new Error('请选择站点')
  }
  return data
}

/** 与文章/页面一致的 site 关系字段（新建由 hook 校验必填）。 */
export const siteScopedSiteField: Field = {
  name: 'site',
  type: 'relationship',
  relationTo: 'sites',
  admin: {
    description: '新建必填；旧数据可暂为空后再补全。',
    position: 'sidebar',
  },
  filterOptions: sitesRelationshipFilterOptions,
}
