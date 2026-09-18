import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

/** Actual P1 central UI and durable database. The synthetic request is cancelled
 * before returning; no planner, resource creation or permission change occurs. */
export async function checkRemoteAdmission({ hub,centralQuery }) {
  const region = hub.getByRole('region',{ name: '建站申请',exact: true })
  const invoke = (path,body) => hub.evaluate(async ({ path,body }) => {
    const response = await fetch(path,{ signal: AbortSignal.timeout(20000),...(body === undefined ? {} : {
      method: 'POST',headers: { 'content-type': 'application/json' },body: JSON.stringify(body) }) })
    return { status: response.status,cache: response.headers.get('cache-control'),body: await response.json() }
  },{ path,body })
  const before = await centralQuery('SELECT operation_id,checkpoint,completed_at FROM site_provision_operations ORDER BY operation_id')
  const schema = await centralQuery('SELECT operation_id,completed FROM p1_schema_bootstrap WHERE id=1')
  assert.deepEqual(schema,[{ operation_id: 'p1-central-schema-v5',completed: 1 }])
  let input
  try {
    await region.getByLabel('所属租户',{ exact: true }).selectOption('1')
    await region.getByRole('button',{ name: '申请建站',exact: true }).click()
    await region.getByLabel('网站名称',{ exact: true }).fill('P1 远程建站申请验收')
    await region.getByLabel('站点 ID',{ exact: true }).fill(`p1-check-${randomUUID().replaceAll('-','').slice(0,20)}`)
    await region.getByLabel('负责人',{ exact: true }).selectOption('7')
    await region.getByLabel('网站时区',{ exact: true }).fill('Europe/Berlin')
    const sent = hub.waitForRequest(request => new URL(request.url()).pathname === '/auth/site-request' && request.method() === 'POST')
    const response = hub.waitForResponse(response => new URL(response.url()).pathname === '/auth/site-request' && response.request().method() === 'POST')
    await region.getByRole('button',{ name: '提交申请',exact: true }).click()
    input = (await sent).postDataJSON()
    console.log(JSON.stringify({ event: 'p1_remote_admission_submitted',requestId: input.requestId,siteId: input.siteId }))
    assert.equal((await response).status(),200)
    const row = region.locator(`[data-request-id="${input.requestId}"]`)
    await row.getByText('等待执行',{ exact: true }).waitFor()
    const replay = await invoke('/auth/site-request',input)
    assert.equal(replay.status,200); assert.equal(replay.body.replayed,true)
    const read = await invoke(`/auth/site-request?requestId=${input.requestId}`)
    assert.equal(read.status,200); assert.equal(read.cache,'private, no-store')
    assert.equal(read.body.state,'queued'); assert.doesNotMatch(JSON.stringify(read.body),/prepared|databaseId|bindingName|workerGroup/)
    assert.deepEqual(await centralQuery('SELECT COUNT(*) AS n FROM site_provision_requests WHERE request_id=?',[input.requestId]),[{ n: 1 }])
    await row.getByRole('button',{ name: /^取消申请 / }).click()
    await row.getByRole('button',{ name: '保留申请',exact: true }).click()
    assert.equal((await invoke(`/auth/site-request?requestId=${input.requestId}`)).body.state,'queued')
    await row.getByRole('button',{ name: /^取消申请 / }).click()
    await row.getByRole('button',{ name: '确认取消申请',exact: true }).click()
    await row.getByText('已取消',{ exact: true }).waitFor()
    assert.equal((await invoke('/auth/site-request-cancel',{ requestId: input.requestId })).status,200)
    for (const [name,width,height] of [['desktop',1365,900],['mobile',390,844]]) {
      await hub.setViewportSize({ width,height }); await region.scrollIntoViewIfNeeded()
      assert.equal(await hub.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true)
      await region.screenshot({ path: `.cloudflare-ci/remote-admission-${name}.png` })
    }
    assert.deepEqual(await centralQuery('SELECT state,prepared_request_json FROM site_provision_requests WHERE request_id=?',[input.requestId]),
      [{ state: 'cancelled',prepared_request_json: null }])
    assert.deepEqual(await centralQuery('SELECT operation_id,checkpoint,completed_at FROM site_provision_operations ORDER BY operation_id'),before)
    console.log(JSON.stringify({ event: 'p1_remote_admission_passed',checkedAt: new Date().toISOString(),remoteDeployment: true,requestId: input.requestId,
      checks: ['central-v5','real-ui-submit','same-request-retry','one-durable-request','private-summary','cancel-confirmation','cancel-retry','desktop-mobile','no-provision-effects'] }))
  } finally {
    // Cancellation is idempotent. Reconcile an ambiguous response using this
    // exact synthetic request; never delete history or cancel another request.
    if (input) for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const saved = await invoke(`/auth/site-request?requestId=${input.requestId}`)
        if (saved.status === 404 || saved.status === 200 && saved.body.state === 'cancelled') break
        assert.equal(saved.status,200); assert.equal(saved.body.state,'queued')
        assert.equal((await invoke('/auth/site-request-cancel',{ requestId: input.requestId })).status,200)
        assert.equal((await invoke(`/auth/site-request?requestId=${input.requestId}`)).body.state,'cancelled')
        break
      } catch (error) { if (attempt === 3) throw error }
    }
    await hub.setViewportSize({ width: 1365,height: 900 })
  }
}
