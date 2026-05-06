import type { CollectionBeforeChangeHook, PayloadRequest } from 'payload'

import { isUsersCollection } from '@/utilities/announcementAccess'
import { parseRelationshipId } from '@/utilities/parseRelationshipId'
import { resolveVisibleSiteIds } from '@/utilities/siteVisibilityScope'
import { userHasUnscopedAdminAccess } from '@/utilities/superAdmin'
import { userHasRole, userHasTenantGeneralManagerRole } from '@/utilities/userRoles'

function bypassSiteVisibilityValidation(req: PayloadRequest): boolean {
  if (!isUsersCollection(req.user)) return true
  if (userHasUnscopedAdminAccess(req.user)) return true
  if (userHasTenantGeneralManagerRole(req.user)) return true
  if (userHasRole(req.user, 'ops-manager')) return true
  return false
}

/** Ensure `site` points at a row visible under `buildSitesVisibilityWhere` (siteVisibilityScope). */
export const validateSiteFieldWithinVisibilityScope: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (bypassSiteVisibilityValidation(req)) return data

  const incoming = (data as { site?: unknown }).site
  const merged =
    incoming !== undefined ? incoming : (originalDoc as { site?: unknown } | undefined)?.site

  const siteId = parseRelationshipId(merged)
  if (siteId == null) {
    if (operation === 'create') {
      throw new Error('请选择站点')
    }
    return data
  }

  const allowed = await resolveVisibleSiteIds(req.payload, req)
  if (allowed === true) return data
  if (allowed === false) {
    throw new Error('无权为该站点创建或修改内容')
  }
  if (!allowed.includes(siteId)) {
    throw new Error('无权操作该站点下的内容')
  }
  return data
}

function siteIdsFromSitesField(sites: unknown): number[] {
  if (!Array.isArray(sites)) return []
  const out: number[] = []
  for (const s of sites) {
    const id = parseRelationshipId(s)
    if (id != null) out.push(id)
  }
  return out
}

export const validateAuthorsSitesWithinVisibilityScope: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (bypassSiteVisibilityValidation(req)) return data

  const incoming = (data as { sites?: unknown }).sites
  const merged =
    incoming !== undefined ? incoming : (originalDoc as { sites?: unknown } | undefined)?.sites

  const siteIds = siteIdsFromSitesField(merged)
  if (siteIds.length === 0) {
    if (operation === 'create') {
      throw new Error('请至少选择一个站点')
    }
    return data
  }

  const allowed = await resolveVisibleSiteIds(req.payload, req)
  if (allowed === true) return data
  if (allowed === false) {
    throw new Error('无权修改作者')
  }
  for (const sid of siteIds) {
    if (!allowed.includes(sid)) {
      throw new Error('无权将作者关联到所选站点')
    }
  }
  return data
}

export const validateOriginalEvidenceArticleVisibilityScope: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (bypassSiteVisibilityValidation(req)) return data

  const incoming = (data as { article?: unknown }).article
  const merged =
    incoming !== undefined ? incoming : (originalDoc as { article?: unknown } | undefined)?.article

  const articleId = parseRelationshipId(merged)
  if (articleId == null) {
    if (operation === 'create') {
      throw new Error('请选择文章')
    }
    return data
  }

  const article = await req.payload.findByID({
    collection: 'articles',
    id: articleId,
    depth: 0,
    req,
    overrideAccess: true,
  })
  const siteId = parseRelationshipId((article as { site?: unknown })?.site)
  if (siteId == null) {
    throw new Error('所选文章未绑定站点，无法保存原创证据')
  }

  const allowed = await resolveVisibleSiteIds(req.payload, req)
  if (allowed === true) return data
  if (allowed === false) {
    throw new Error('无权保存原创证据')
  }
  if (!allowed.includes(siteId)) {
    throw new Error('只能为本站点的文章添加原创证据')
  }
  return data
}
