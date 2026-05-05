import type { Payload } from 'payload'

import {
  mergePipelineProfileOntoGlobal,
  normalizeGlobalPipelineDoc,
  type PipelineSettingShape,
} from '@/utilities/pipelineSettingShape'
import { tenantIdFromRelation } from '@/utilities/tenantScope'

export type ResolvedPipelineSource = 'explicit' | 'article' | 'site' | 'tenant_default' | 'global_only'

export type ResolvedPipelineConfig = {
  merged: PipelineSettingShape
  profileId: number | null
  profileSlug: string | null
  source: ResolvedPipelineSource
}

function profileIdFromRelation(p: unknown): number | null {
  if (p == null) return null
  if (typeof p === 'number' && Number.isFinite(p)) return p
  if (typeof p === 'object' && 'id' in p) {
    const id = (p as { id: unknown }).id
    if (typeof id === 'number' && Number.isFinite(id)) return id
  }
  return null
}

async function loadPipelineProfileDoc(
  payload: Payload,
  id: number,
): Promise<Record<string, unknown> | null> {
  try {
    const doc = await payload.findByID({
      collection: 'pipeline-profiles',
      id: String(id),
      depth: 0,
      overrideAccess: true,
    })
    return doc && typeof doc === 'object' ? (doc as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function assertProfileTenantMatches(
  profile: Record<string, unknown> | null,
  tenantId: number,
): Promise<boolean> {
  if (!profile) return false
  const pt = tenantIdFromRelation(profile.tenant as never)
  return pt === tenantId
}

async function findTenantDefaultProfileId(payload: Payload, tenantId: number): Promise<number | null> {
  const { docs } = await payload.find({
    collection: 'pipeline-profiles',
    where: {
      and: [{ tenant: { equals: tenantId } }, { isDefault: { equals: true } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const first = docs[0] as { id?: number } | undefined
  return typeof first?.id === 'number' && Number.isFinite(first.id) ? first.id : null
}

export type ResolvePipelineConfigArgs = {
  payload: Payload
  tenantId: number
  siteId?: number | null
  articleId?: number | null
  explicitProfileId?: number | null
}

/**
 * Resolution order: explicitProfileId → article.pipelineProfile → site.pipelineProfile → tenant isDefault profile → global only.
 */
export async function resolvePipelineConfig(args: ResolvePipelineConfigArgs): Promise<ResolvedPipelineConfig> {
  const { payload, tenantId } = args
  const globalRaw = await payload.findGlobal({ slug: 'pipeline-settings', depth: 0 })
  const base = normalizeGlobalPipelineDoc(globalRaw as Record<string, unknown>)

  let profileId: number | null = null
  let source: ResolvedPipelineSource = 'global_only'
  let profileSlug: string | null = null

  const tryApply = async (
    id: number | null | undefined,
    nextSource: ResolvedPipelineSource,
  ): Promise<boolean> => {
    if (id == null || !Number.isFinite(id)) return false
    const doc = await loadPipelineProfileDoc(payload, id)
    if (!(await assertProfileTenantMatches(doc, tenantId))) {
      payload.logger?.warn?.(
        `[resolvePipelineConfig] pipeline profile ${id} tenant mismatch for tenant ${tenantId}; ignoring`,
      )
      return false
    }
    profileId = id
    source = nextSource
    profileSlug = typeof doc?.slug === 'string' && doc.slug.trim() ? doc.slug.trim() : null
    return true
  }

  if (await tryApply(args.explicitProfileId, 'explicit')) {
    const doc = await loadPipelineProfileDoc(payload, profileId!)
    const merged = mergePipelineProfileOntoGlobal(base, doc)
    return { merged, profileId, profileSlug, source }
  }

  if (args.articleId != null && Number.isFinite(args.articleId)) {
    try {
      const article = await payload.findByID({
        collection: 'articles',
        id: String(args.articleId),
        depth: 0,
        overrideAccess: true,
      })
      const a = article as Record<string, unknown> | null
      const pid = profileIdFromRelation(a?.pipelineProfile)
      if (await tryApply(pid, 'article')) {
        const doc = await loadPipelineProfileDoc(payload, profileId!)
        const merged = mergePipelineProfileOntoGlobal(base, doc)
        return { merged, profileId, profileSlug, source }
      }
    } catch {
      /* ignore */
    }
  }

  if (args.siteId != null && Number.isFinite(args.siteId)) {
    try {
      const site = await payload.findByID({
        collection: 'sites',
        id: String(args.siteId),
        depth: 0,
        overrideAccess: true,
      })
      const s = site as Record<string, unknown> | null
      const pid = profileIdFromRelation(s?.pipelineProfile)
      if (await tryApply(pid, 'site')) {
        const doc = await loadPipelineProfileDoc(payload, profileId!)
        const merged = mergePipelineProfileOntoGlobal(base, doc)
        return { merged, profileId, profileSlug, source }
      }
    } catch {
      /* ignore */
    }
  }

  const defId = await findTenantDefaultProfileId(payload, tenantId)
  if (await tryApply(defId, 'tenant_default')) {
    const doc = await loadPipelineProfileDoc(payload, profileId!)
    const merged = mergePipelineProfileOntoGlobal(base, doc)
    return { merged, profileId, profileSlug, source }
  }

  return { merged: base, profileId: null, profileSlug: null, source: 'global_only' }
}

/**
 * Load site → tenant when only siteId is known, then resolve pipeline config.
 */
export async function resolvePipelineConfigForSite(
  payload: Payload,
  siteId: number,
  explicitProfileId?: number | null,
): Promise<ResolvedPipelineConfig | { ok: false; error: string }> {
  try {
    const site = await payload.findByID({
      collection: 'sites',
      id: String(siteId),
      depth: 0,
      overrideAccess: true,
    })
    const tenantId = tenantIdFromRelation((site as { tenant?: unknown } | null)?.tenant)
    if (tenantId == null) {
      return { ok: false, error: 'site has no tenant' }
    }
    return resolvePipelineConfig({
      payload,
      tenantId,
      siteId,
      explicitProfileId: explicitProfileId ?? undefined,
    })
  } catch {
    return { ok: false, error: 'site not found' }
  }
}

/**
 * Resolve using article (for draft-section, briefs, etc.): uses article.pipelineProfile, then site, etc.
 */
export async function resolvePipelineConfigForArticle(
  payload: Payload,
  articleId: number,
  explicitProfileId?: number | null,
): Promise<ResolvedPipelineConfig | { ok: false; error: string }> {
  try {
    const article = await payload.findByID({
      collection: 'articles',
      id: String(articleId),
      depth: 0,
      overrideAccess: true,
    })
    const a = article as Record<string, unknown> | null
    const tenantId = tenantIdFromRelation(a?.tenant as never)
    let siteId: number | null = null
    const rawSite = a?.site
    if (typeof rawSite === 'number' && Number.isFinite(rawSite)) siteId = rawSite
    else if (rawSite && typeof rawSite === 'object' && 'id' in rawSite) {
      const id = (rawSite as { id: unknown }).id
      if (typeof id === 'number' && Number.isFinite(id)) siteId = id
    }

    if (tenantId == null) {
      if (siteId != null) {
        const cfg = await resolvePipelineConfigForSite(payload, siteId, explicitProfileId)
        if ('ok' in cfg && cfg.ok === false) return cfg
        return cfg as ResolvedPipelineConfig
      }
      return { ok: false, error: 'article has no tenant' }
    }

    return resolvePipelineConfig({
      payload,
      tenantId,
      siteId,
      articleId,
      explicitProfileId: explicitProfileId ?? undefined,
    })
  } catch {
    return { ok: false, error: 'article not found' }
  }
}

export type ResolveMergedForPipelineRouteArgs = {
  payload: Payload
  tenantId?: number | null
  siteId?: number | null
  articleId?: number | null
  explicitProfileId?: number | null
}

/**
 * Best-effort merged pipeline knobs for HTTP handlers: article → site → tenant → global only.
 */
export async function resolveMergedForPipelineRoute(
  args: ResolveMergedForPipelineRouteArgs,
): Promise<PipelineSettingShape> {
  const { payload, explicitProfileId } = args
  const ex = explicitProfileId != null && Number.isFinite(explicitProfileId) ? explicitProfileId : undefined

  const articleId = args.articleId
  if (articleId != null && Number.isFinite(articleId)) {
    const cfg = await resolvePipelineConfigForArticle(payload, Math.floor(articleId), ex)
    if (!('ok' in cfg)) return cfg.merged
  }

  const siteId = args.siteId
  if (siteId != null && Number.isFinite(siteId)) {
    const cfg = await resolvePipelineConfigForSite(payload, Math.floor(siteId), ex)
    if (!('ok' in cfg)) return cfg.merged
  }

  const tenantId = args.tenantId
  if (tenantId != null && Number.isFinite(tenantId)) {
    const cfg = await resolvePipelineConfig({
      payload,
      tenantId: Math.floor(tenantId),
      siteId: siteId != null && Number.isFinite(siteId) ? Math.floor(siteId) : undefined,
      explicitProfileId: ex,
    })
    return cfg.merged
  }

  const globalRaw = await payload.findGlobal({ slug: 'pipeline-settings', depth: 0 })
  return normalizeGlobalPipelineDoc(globalRaw as Record<string, unknown>)
}
