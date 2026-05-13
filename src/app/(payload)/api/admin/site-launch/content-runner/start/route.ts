import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Config } from '@/payload-types'
import { POST as enqueueArticleBatch } from '@/app/(payload)/api/admin/articles/batch-enqueue/route'
import { isUsersCollection } from '@/utilities/announcementAccess'
import {
  runSiteContentRunner,
  SITE_CONTENT_RUNNER_JOB_TYPE,
  type SiteContentRunnerInput,
} from '@/utilities/siteContentRunner'
import { getTenantScopeForStats, type TenantScope } from '@/utilities/tenantScope'

export const dynamic = 'force-dynamic'

function tenantIdFromRelation(tenant: number | { id: number } | null | undefined): number | null {
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

function numberFromBody(value: unknown): number | null {
  const n =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(n) ? Math.floor(n) : null
}

async function scheduleBackgroundRunner(promise: Promise<unknown>): Promise<void> {
  promise.catch((e) => {
    console.error('[site-content-runner] background failure', e)
  })
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const ctx = getCloudflareContext()
    ctx.ctx.waitUntil(promise)
  } catch {
    // Local Next.js dev / non-Cloudflare runtimes continue via the unawaited promise above.
  }
}

export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !isUsersCollection(user)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const siteId = numberFromBody(body.siteId)
  if (siteId == null) {
    return Response.json({ error: 'siteId required' }, { status: 400 })
  }

  const site = await payload.findByID({ collection: 'sites', id: siteId, depth: 0 })
  if (!site) {
    return Response.json({ error: 'Site not found' }, { status: 404 })
  }
  const siteTenantId = tenantIdFromRelation(site.tenant)
  if (!siteAccessible(getTenantScopeForStats(user), siteTenantId)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (siteTenantId == null) {
    return Response.json({ error: '所选站点未关联租户，无法启动内容 Runner' }, { status: 400 })
  }

  const enqueueHeaders = new Headers(request.headers)
  enqueueHeaders.set('content-type', 'application/json')
  enqueueHeaders.delete('content-length')
  const enqueueRes = await enqueueArticleBatch(
    new Request(new URL('/api/admin/articles/batch-enqueue', request.url), {
      method: 'POST',
      headers: enqueueHeaders,
      body: JSON.stringify({
        siteId,
        mode: typeof body.mode === 'string' ? body.mode : 'default',
        limit: numberFromBody(body.limit) ?? undefined,
        pipelineProfileId: body.pipelineProfileId,
      }),
    }),
  )
  const enqueueBody = (await enqueueRes.json().catch(() => ({}))) as Record<string, unknown>
  if (!enqueueRes.ok || enqueueBody.ok === false) {
    return Response.json(enqueueBody, { status: enqueueRes.status })
  }

  const runnerInput: SiteContentRunnerInput = {
    siteId,
    batchMaxRuns: numberFromBody(body.batchMaxRuns) ?? 20,
    batchBudgetMs: numberFromBody(body.batchBudgetMs) ?? 55_000,
    maxBatches: numberFromBody(body.maxBatches) ?? 80,
    stopOnFailure: body.stopOnFailure !== false,
  }

  const active = await payload.find({
    collection: 'workflow-jobs',
    where: {
      and: [
        { site: { equals: siteId } },
        { jobType: { equals: SITE_CONTENT_RUNNER_JOB_TYPE } },
        { status: { in: ['pending', 'running'] } },
      ],
    },
    limit: 1,
    sort: '-createdAt',
    depth: 0,
    user: user as Config['user'] & { collection: 'users' },
    overrideAccess: false,
  })

  const activeDoc = active.docs[0] as { id: string | number; status?: string | null } | undefined
  let runnerJobId: string | number
  let runnerReused = false
  let scheduled = false

  if (activeDoc) {
    runnerJobId = activeDoc.id
    runnerReused = true
    if (activeDoc.status !== 'running') {
      scheduled = true
      void scheduleBackgroundRunner(
        runSiteContentRunner({
          payload,
          origin: new URL(request.url).origin,
          runnerJobId,
          input: runnerInput,
        }),
      )
    }
  } else {
    const runner = await payload.create({
      collection: 'workflow-jobs',
      data: {
        label: `Site content runner: ${site.name || site.slug || siteId}`.slice(0, 120),
        jobType: SITE_CONTENT_RUNNER_JOB_TYPE,
        status: 'pending',
        site: siteId,
        tenant: siteTenantId,
        input: runnerInput,
      },
      user: user as Config['user'] & { collection: 'users' },
      overrideAccess: false,
    })
    runnerJobId = runner.id
    scheduled = true
    void scheduleBackgroundRunner(
      runSiteContentRunner({
        payload,
        origin: new URL(request.url).origin,
        runnerJobId,
        input: runnerInput,
      }),
    )
  }

  return Response.json({
    ok: true,
    enqueue: enqueueBody,
    runnerJobId,
    runnerReused,
    scheduled,
    message: scheduled
      ? '内容 Runner 已在后端启动；页面关闭后仍可在工作流任务表查看状态。'
      : '已有内容 Runner 正在运行；新排产任务会由该 Runner 继续处理。',
  })
}
