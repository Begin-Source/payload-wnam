import type { Payload } from 'payload'

import type { Config } from '@/payload-types'
import { isUsersCollection } from '@/utilities/announcementAccess'
import { getTenantScopeForStats, type TenantScope } from '@/utilities/tenantScope'

export type WorkflowQuickKind =
  | 'articles'
  | 'pages'
  | 'categories'
  | 'keywords'
  | 'site-blueprints'
  | 'media'

function tenantIdFromRelation(
  tenant: number | { id: number } | null | undefined,
): number | null {
  if (tenant == null || tenant === undefined) return null
  if (typeof tenant === 'number') return tenant
  if (typeof tenant === 'object' && typeof tenant.id === 'number') return tenant.id
  return null
}

function siteAccessible(scope: TenantScope, siteTenantId: number | null): boolean {
  if (scope.mode === 'all') return true
  if (scope.mode === 'none') return false
  if (siteTenantId == null) return false
  return scope.tenantIds.includes(siteTenantId)
}

function labelForKind(kind: WorkflowQuickKind, siteName: string): string {
  switch (kind) {
    case 'pages':
      return `生成页面 · ${siteName}`
    case 'categories':
      return `分类工作流 · ${siteName}`
    case 'keywords':
      return `关键词工作流 · ${siteName}`
    case 'site-blueprints':
      return `设计工作流 · ${siteName}`
    case 'media':
      return `媒体工作流 · ${siteName}`
    default:
      return `生成文章 · ${siteName}`
  }
}

export type CreateWorkflowQuickJobArgs = {
  payload: Payload
  user: Config['user'] & { collection: 'users' }
  kind: WorkflowQuickKind
  siteId: number
  categoryIds: number[]
  topic: string | undefined
}

/**
 * Validates site/tenant access, optional categories (skipped for keywords and media), builds input, creates workflow-jobs.
 */
export async function createWorkflowQuickJob(args: CreateWorkflowQuickJobArgs): Promise<{ id: number }> {
  const { payload, user, kind, siteId, categoryIds, topic } = args
  const scope = getTenantScopeForStats(user)

  const useCategories = kind !== 'keywords' && kind !== 'media'

  const site = await payload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 0,
  })

  if (!site) {
    throw new Error('SITE_NOT_FOUND')
  }

  const siteTenantId = tenantIdFromRelation(site.tenant)
  if (!siteAccessible(scope, siteTenantId)) {
    throw new Error('FORBIDDEN_SITE')
  }

  const categoryDocs: { id: number; name: string; description: string | null }[] = []

  if (useCategories && categoryIds.length > 0) {
    for (const cid of categoryIds) {
      const cat = await payload.findByID({
        collection: 'categories',
        id: cid,
        depth: 0,
      })
      if (!cat) {
        throw new Error(`CATEGORY_NOT_FOUND:${cid}`)
      }
      const catTenantId = tenantIdFromRelation(cat.tenant)
      if (catTenantId !== siteTenantId) {
        throw new Error(`CATEGORY_TENANT_MISMATCH:${cid}`)
      }
      if (scope.mode === 'tenants' && catTenantId != null && !scope.tenantIds.includes(catTenantId)) {
        throw new Error('FORBIDDEN_CATEGORY')
      }
      categoryDocs.push({
        id: cat.id,
        name: cat.name,
        description: cat.description ?? null,
      })
    }
  }

  const categoryHints = categoryDocs
    .map((c) => {
      const desc = c.description?.trim()
      return desc ? `${c.name}: ${desc}` : c.name
    })
    .join('\n')

  const mergedPromptHint = [
    categoryHints ? `分类说明合并:\n${categoryHints}` : '',
    topic ? `主题/要点:\n${topic}` : '主题/要点: （系统选题）',
  ]
    .filter(Boolean)
    .join('\n\n')

  const label = labelForKind(kind, site.name)

  const job = await payload.create({
    collection: 'workflow-jobs',
    data: {
      label,
      jobType: 'ai_generate',
      status: 'pending',
      site: siteId,
      ...(siteTenantId != null ? { tenant: siteTenantId } : {}),
      input: {
        quickActionKind: kind,
        topic: topic ?? null,
        categoryIds: useCategories && categoryIds.length > 0 ? categoryIds : undefined,
        mergedPromptHint,
      },
    },
  })

  return { id: job.id }
}

export function parseWorkflowQuickBody(body: unknown): {
  kind: WorkflowQuickKind
  siteId: number
  categoryIds: number[]
  topic: string | undefined
} | { error: string } {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Invalid JSON' }
  }
  const o = body as Record<string, unknown>
  const kindRaw = o.kind
  const kinds: WorkflowQuickKind[] = [
    'articles',
    'pages',
    'categories',
    'keywords',
    'site-blueprints',
    'media',
  ]
  const kind = kinds.find((k) => k === kindRaw)
  if (!kind) {
    return { error: 'Invalid or missing kind' }
  }

  const siteId = typeof o.siteId === 'number' ? o.siteId : Number(o.siteId)
  if (!Number.isFinite(siteId)) {
    return { error: 'siteId is required' }
  }

  const topic =
    typeof o.topic === 'string' && o.topic.trim().length > 0 ? o.topic.trim() : undefined

  const categoryIds: number[] = []
  if (kind !== 'keywords' && kind !== 'media' && Array.isArray(o.categoryIds)) {
    for (const id of o.categoryIds) {
      const n = typeof id === 'number' ? id : Number(id)
      if (Number.isFinite(n)) categoryIds.push(n)
    }
  }

  return { kind, siteId, categoryIds, topic }
}

export function assertUsersCollection(
  user: Config['user'] | null | undefined,
): asserts user is Config['user'] & { collection: 'users' } {
  if (!user || !isUsersCollection(user)) {
    throw new Error('UNAUTHORIZED')
  }
}
