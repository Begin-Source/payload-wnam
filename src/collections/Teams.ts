import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { loggedInSuperAdminAccessFor } from '@/collections/shared/loggedInSuperAdminAccess'
import { adminGroups } from '@/constants/adminGroups'
import type { User } from '@/payload-types'
import {
  assertTeamUserRels,
  teamsLeadFilterOptions,
  teamsMembersFilterOptions,
  tenantIdFromTeamData,
  userIdFromRelation,
} from '@/utilities/teamsUserScope'

const validateTeamsUserRelations: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const merged: Record<string, unknown> = {
    ...((originalDoc as Record<string, unknown> | null | undefined) ?? {}),
    ...((data as Record<string, unknown> | null | undefined) ?? {}),
  }
  const tenantId = tenantIdFromTeamData(merged)

  const leadId = userIdFromRelation(merged.lead)
  const membersRaw = merged.members
  const memberIds: number[] = []
  if (Array.isArray(membersRaw)) {
    for (const m of membersRaw) {
      const id = userIdFromRelation(m)
      if (id != null) memberIds.push(id)
    }
  }

  if (tenantId == null) {
    if (leadId != null || memberIds.length > 0) {
      throw new Error('请先为团队选择所属租户，再指定组长或成员。')
    }
    return data
  }

  const idSet = new Set<number>()
  if (leadId != null) idSet.add(leadId)
  for (const id of memberIds) idSet.add(id)
  if (idSet.size === 0) return data

  const { docs } = await req.payload.find({
    collection: 'users',
    where: { id: { in: [...idSet] } },
    limit: idSet.size,
    depth: 0,
  })
  const byId = new Map(docs.map((u) => [u.id, u as User]))

  if (leadId != null) {
    const u = byId.get(leadId)
    if (!u) throw new Error('组长用户不存在。')
    assertTeamUserRels(u, 'team-lead', tenantId, '组长')
  }
  for (const mid of memberIds) {
    const u = byId.get(mid)
    if (!u) throw new Error('所选成员用户不存在。')
    assertTeamUserRels(u, 'site-manager', tenantId, '成员')
  }

  return data
}

export const Teams: CollectionConfig = {
  slug: 'teams',
  labels: { singular: '团队', plural: '团队' },
  admin: {
    group: adminGroups.team,
    useAsTitle: 'name',
    defaultColumns: ['tenant', 'name', 'updatedAt'],
    description: '每租户可有多条团队记录；组长与成员由角色与本租户共同限定，账号在「系统」中管理。',
  },
  access: loggedInSuperAdminAccessFor('teams'),
  hooks: {
    beforeChange: [validateTeamsUserRelations],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: '团队名称',
    },
    {
      name: 'slug',
      type: 'text',
      label: 'Slug',
      admin: {
        description: '选填。站内链接或唯一定位可与租户联合使用。',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
      label: '说明',
    },
    {
      name: 'lead',
      type: 'relationship',
      relationTo: 'users',
      label: '组长',
      filterOptions: teamsLeadFilterOptions,
      admin: {
        position: 'sidebar',
        description: '须为「组长」角色，且已分配到本团队所属租户。',
      },
    },
    {
      name: 'members',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      label: '成员',
      filterOptions: teamsMembersFilterOptions,
      admin: {
        position: 'sidebar',
        description: '须为「站长」角色，且已分配到本团队所属租户。兼为组长时也可出现在此列表并可选。',
      },
    },
  ],
}
