import { cache } from 'react'

import type { Payload, Where } from 'payload'

import type { Config, KnowledgeBase, OperationManual } from '@/payload-types'

import {
  groupKnowledgeByEntryType,
  groupManualsByLevel,
  type PortalNavKbGroup,
  type PortalNavManualGroup,
} from '@/utilities/knowledgePortalGrouping'
import { resolvePortalTenantId } from '@/utilities/knowledgePortalTenant'

type UsersUser = Config['user'] & { collection: 'users' }

function asUser(u: UsersUser): UsersUser {
  return { ...u, collection: 'users' }
}

/** 与 Admin 当前租户（Cookie `payload-tenant`）一致，仅拉取该租户下已发布文档。 */
async function wherePortalPublishedList(user: UsersUser): Promise<Where> {
  const tenantId = await resolvePortalTenantId(user)
  if (tenantId == null) {
    return { status: { equals: 'published' } }
  }
  return {
    and: [{ status: { equals: 'published' } }, { tenant: { equals: tenantId } }],
  }
}

async function wherePortalPublishedBySlug(user: UsersUser, slug: string): Promise<Where> {
  const tenantId = await resolvePortalTenantId(user)
  const parts: Where[] = [
    { slug: { equals: slug } },
    { status: { equals: 'published' } },
  ]
  if (tenantId != null) {
    parts.push({ tenant: { equals: tenantId } })
  }
  return { and: parts }
}

/** 已发布知识库文档列表（尊重 access + 当前租户）。 */
export async function findPublishedKnowledgeDocs(
  payload: Payload,
  user: UsersUser,
): Promise<KnowledgeBase[]> {
  const res = await payload.find({
    collection: 'knowledge-base',
    where: await wherePortalPublishedList(user),
    sort: '-updatedAt',
    limit: 200,
    depth: 0,
    user: asUser(user),
    overrideAccess: false,
  })
  return res.docs as KnowledgeBase[]
}

/** 已发布操作手册列表（当前租户）。 */
export async function findPublishedOperationManuals(
  payload: Payload,
  user: UsersUser,
): Promise<OperationManual[]> {
  const res = await payload.find({
    collection: 'operation-manuals',
    where: await wherePortalPublishedList(user),
    sort: 'sortOrder',
    limit: 200,
    depth: 0,
    user: asUser(user),
    overrideAccess: false,
  })
  return res.docs as OperationManual[]
}

export async function findKnowledgeBySlug(
  payload: Payload,
  user: UsersUser,
  slug: string,
): Promise<KnowledgeBase | null> {
  const res = await payload.find({
    collection: 'knowledge-base',
    where: await wherePortalPublishedBySlug(user, slug),
    limit: 1,
    depth: 0,
    user: asUser(user),
    overrideAccess: false,
  })
  return (res.docs[0] as KnowledgeBase | undefined) ?? null
}

export async function findOperationManualBySlug(
  payload: Payload,
  user: UsersUser,
  slug: string,
): Promise<OperationManual | null> {
  const res = await payload.find({
    collection: 'operation-manuals',
    where: await wherePortalPublishedBySlug(user, slug),
    limit: 1,
    depth: 0,
    user: asUser(user),
    overrideAccess: false,
  })
  return (res.docs[0] as OperationManual | undefined) ?? null
}

export type KnowledgePortalNavData = {
  kbGroups: PortalNavKbGroup[]
  manualGroups: PortalNavManualGroup[]
  kbLinkableCount: number
  manualLinkableCount: number
}

/**
 * 同一请求内 layout + 页面可共享，避免重复查库。
 */
export const getKnowledgePortalNavData = cache(
  async (payload: Payload, user: UsersUser): Promise<KnowledgePortalNavData> => {
    const [kbList, manualList] = await Promise.all([
      findPublishedKnowledgeDocs(payload, user).catch(() => [] as KnowledgeBase[]),
      findPublishedOperationManuals(payload, user).catch(() => [] as OperationManual[]),
    ])
    const kbLinkableCount = kbList.filter(
      (d) => typeof d.slug === 'string' && d.slug.trim() !== '',
    ).length
    const manualLinkableCount = manualList.filter(
      (d) => typeof d.slug === 'string' && d.slug.trim() !== '',
    ).length
    return {
      kbGroups: groupKnowledgeByEntryType(kbList),
      manualGroups: groupManualsByLevel(manualList),
      kbLinkableCount,
      manualLinkableCount,
    }
  },
)
