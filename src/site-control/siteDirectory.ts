import { assertSiteId, type SiteState } from './registry'
import { payloadSessionAuthority } from './payloadSessionAuthority'
import { CENTRAL_ORIGIN, requireCentralOrigin, privateResponse } from './sessionHttp'
import { SiteAccessDeniedError, type SiteRole } from './sso'

export type SiteDirectoryEntry = { siteId: string; name: string; role: SiteRole; state: SiteState; routingVersion: number }
export type SiteDirectoryPage = { sites: SiteDirectoryEntry[]; nextCursor: string | null }
type Identity = { userId: string; sessionId: string }

/** Central metadata only. A global admin role does not replace an explicit
 * site grant. Neither this query nor the dashboard contacts a site's D1. */
export async function listGrantedSites(database: D1Database, identity: Identity, query = '', after = ''): Promise<SiteDirectoryPage> {
  if (query.length > 120) throw new Error('Search too long')
  if (after) assertSiteId(after)
  const authority = payloadSessionAuthority(database)
  if (!await authority(identity.userId, identity.sessionId)) throw new SiteAccessDeniedError('Central login required')
  const { results } = await database.prepare(`SELECT r.site_id AS siteId, COALESCE(s.name,r.site_id) AS name,
    a.role, r.migration_state AS state, r.routing_version AS routingVersion FROM site_runtime_access a
    JOIN site_runtime_registry r ON r.site_id = a.site_id
    LEFT JOIN sites s ON s.runtime_site_id = r.site_id
    WHERE a.user_id = ? AND r.site_id > ?
      AND (? = '' OR instr(lower(COALESCE(s.name,r.site_id)),lower(?)) > 0 OR instr(r.site_id,lower(?)) > 0)
    ORDER BY r.site_id LIMIT 51`).bind(identity.userId,after,query,query,query).all<SiteDirectoryEntry>()
  if (!await authority(identity.userId, identity.sessionId)) throw new SiteAccessDeniedError('Central login required')
  for (const row of results) {
    assertSiteId(row.siteId)
    if (typeof row.name !== 'string' || !Number.isSafeInteger(row.routingVersion) || row.routingVersion < 1 || !['viewer','editor','publisher','manager'].includes(row.role) ||
      !['provisioning','active','paused','migrating','retired'].includes(row.state)) throw new Error('Invalid site directory')
  }
  const sites = results.slice(0,50)
  return { sites, nextCursor: results.length > 50 ? sites[49].siteId : null }
}

export async function centralSiteDirectory(request: Request, options: {
  centralOrigin?: string; database: D1Database; authenticate: (request: Request) => Promise<Identity | null>
}): Promise<Response> {
  const centralOrigin = requireCentralOrigin(options.centralOrigin ?? CENTRAL_ORIGIN)
  const url = new URL(request.url)
  if (url.origin !== centralOrigin || url.pathname !== '/auth/sites') return privateResponse('Not found',404)
  if (request.method !== 'GET') return privateResponse('Method not allowed',405,{ allow: 'GET' })
  const query = url.searchParams.get('q')?.trim() ?? '', after = url.searchParams.get('after') ?? ''
  try {
    if (query.length > 120 || [...url.searchParams.keys()].some(key => !['q','after'].includes(key) || url.searchParams.getAll(key).length !== 1)) throw new Error('Invalid query')
    if (after) assertSiteId(after)
  } catch { return privateResponse('Invalid request',400) }
  try {
    const identity = await options.authenticate(request)
    if (!identity) return privateResponse('Central login required',401)
    return privateResponse(JSON.stringify(await listGrantedSites(options.database,identity,query,after)),200,{ 'content-type': 'application/json' })
  } catch (error) {
    return privateResponse(error instanceof SiteAccessDeniedError ? 'Central login required' : 'Site list unavailable',
      error instanceof SiteAccessDeniedError ? 401 : 503)
  }
}
