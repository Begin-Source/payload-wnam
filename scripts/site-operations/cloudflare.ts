import { z } from 'zod'
import { provisionUuidSchema, type ProvisionPlan } from '../../src/site-control/provisionPlan'

type Envelope<T> = { success: boolean; result: T; result_info?: { page?: number; total_pages?: number; total_count?: number } }
export class CloudflareOperationError extends Error {
  constructor(public status: number,public ambiguous: boolean) { super(`Cloudflare operation failed (${status || 'network'}; ${ambiguous ? 'reconcile required' : 'rejected'})`) }
}
type Dependencies = { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; random?: () => number }

/** Only the selected account API. No endpoint overrides, redirects, token in
 * error bodies, or generic retry of ambiguous writes. */
export class ProvisionCloudflare {
  private fetch: typeof fetch
  private sleep: (ms: number) => Promise<void>
  private random: () => number
  constructor(readonly accountId: string,private token: string,dependencies: Dependencies = {}) {
    if (accountId !== 'd487cf34c606620b442632a72272014d' || !token) throw new Error('Explicit provision account and CI credential required')
    this.fetch = dependencies.fetch ?? fetch
    this.sleep = dependencies.sleep ?? (ms => new Promise(resolve => setTimeout(resolve,ms)))
    this.random = dependencies.random ?? Math.random
  }
  async request<T>(path: string,body?: unknown): Promise<Envelope<T>> {
    if (!/^[a-z0-9][a-z0-9_/?=&%.-]*$/i.test(path) || path.includes('..') || path.startsWith('accounts/')) throw new Error('Invalid account API path')
    return this.scopedRequest<T>(`accounts/${this.accountId}/${path}`,body)
  }
  async zone(id: string): Promise<{ id: string; name: string; account: { id: string } }> {
    if (id !== '8d8fd673a6aeacf85360bc9e397d3002') throw new Error('Explicit provision zone required')
    return (await this.scopedRequest<{ id: string; name: string; account: { id: string } }>(`zones/${id}`)).result
  }
  async domainRecords(zoneId: string,host: string): Promise<unknown[]> {
    if (zoneId !== '8d8fd673a6aeacf85360bc9e397d3002' || !/^cms-site-[a-z0-9-]+\.beginos\.org$/.test(host)) throw new Error('Explicit provision host required')
    return (await this.scopedRequest<unknown[]>(`zones/${zoneId}/dns_records?name=${encodeURIComponent(host)}`)).result
  }
  private async scopedRequest<T>(path: string,body?: unknown): Promise<Envelope<T>> {
    const write = body !== undefined
    for (let attempt = 0; attempt < 5; attempt++) {
      let response: Response
      try {
        response = await this.fetch(`https://api.cloudflare.com/client/v4/${path}`,{
          method: write ? 'POST' : 'GET',redirect: 'error',signal: AbortSignal.timeout(20000),
          headers: { authorization: `Bearer ${this.token}`,'content-type': 'application/json' },...(write ? { body: JSON.stringify(body) } : {}),
        })
      } catch {
        if (write || attempt === 4) throw new CloudflareOperationError(0,write)
        await this.sleep(Math.min(30000,1000*2**attempt)+Math.floor(this.random()*250)); continue
      }
      let data: Envelope<T> | null = null
      try { data = await response.json() as Envelope<T> } catch { /* Never echo provider response text. */ }
      if (response.ok && data?.success === true) return data
      // Retry an explicitly rejected rate-limit response, never an ambiguous
      // create (5xx, malformed 2xx, or network loss). Reads may retry 5xx.
      const retryable = response.status === 429 && data?.success === false || !write && response.status >= 500
      if (retryable && attempt < 4) {
        const header = response.headers.get('retry-after')
        const retryMs = header ? /^\d+(?:\.\d+)?$/.test(header) ? Number(header)*1000 : Date.parse(header)-Date.now() : 0
        const delay = Math.max(Number.isFinite(retryMs) ? retryMs : 0,1000*2**attempt)+Math.floor(this.random()*250)
        // Long waits are returned to the operator for a later run, not clipped
        // into an earlier request that violates the provider's Retry-After.
        if (delay <= 60000) { await this.sleep(Math.max(0,delay)); continue }
      }
      throw new CloudflareOperationError(response.status,write && (response.status >= 500 || !data || response.ok))
    }
    throw new Error('Cloudflare retry budget exhausted')
  }
  async findDatabase(name: string): Promise<DatabaseInfo | null> {
    if (!/^[a-z0-9-]{1,64}$/.test(name)) throw new Error('Invalid provision database name')
    const matches: DatabaseInfo[] = []
    for (let page = 1; page <= 100; page++) {
      const response = await this.request<unknown[]>(`d1/database?name=${encodeURIComponent(name)}&per_page=100&page=${page}`)
      if (!Array.isArray(response.result)) throw new Error('Invalid D1 list response')
      for (const item of response.result) {
        const value = listDatabase.parse(item)
        if (value.name === name) matches.push(await this.database(value.uuid))
      }
      const total = response.result_info?.total_pages
      if (total !== undefined && (!Number.isSafeInteger(total) || total < 0 || total > 100)) throw new Error('D1 list pagination out of bounds')
      if (total !== undefined ? page >= total : response.result.length < 100) {
        if (matches.length > 1) throw new Error('Ambiguous database name')
        return matches[0] ?? null
      }
    }
    throw new Error('D1 list pagination incomplete')
  }
  async database(id: string): Promise<DatabaseInfo> {
    provisionUuidSchema.parse(id)
    const result = databaseInfo.parse((await this.request<unknown>(`d1/database/${id}`)).result)
    if (result.uuid !== id) throw new Error('D1 identity mismatch')
    return result
  }
  async createDatabase(plan: ProvisionPlan): Promise<DatabaseInfo> {
    if (plan.accountId !== this.accountId) throw new Error('D1 account mismatch')
    const result = listDatabase.parse((await this.request<unknown>('d1/database',{
      name: plan.databaseName,primary_location_hint: plan.locationHint,read_replication: { mode: plan.readReplication },
    })).result)
    if (result.name !== plan.databaseName) throw new Error('D1 create identity mismatch')
    return this.database(result.uuid)
  }
}
const listDatabase = z.object({ uuid: provisionUuidSchema,name: z.string() })
const databaseInfo = listDatabase.extend({ created_at: z.string().datetime({ offset: true }),read_replication: z.object({ mode: z.literal('disabled') }),
  primary_location_hint: z.string().optional(),file_size: z.number().optional() })
export type DatabaseInfo = z.infer<typeof databaseInfo>
