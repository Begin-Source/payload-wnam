import assert from 'node:assert/strict'

/** Complete central Worker, native D1, Chromium and real Payload login in the
 * disposable Cloudflare fixture only. No cloud provisioning API is called. */
export async function checkAdmissionBrowser({ hub,database }) {
  const region = hub.getByRole('region',{ name: '建站申请',exact: true })
  const invoke = (path,body) => hub.evaluate(async ({ path,body }) => {
    const response = await fetch(path,{ signal: AbortSignal.timeout(20000),...(body === undefined ? {} : {
      method: 'POST',headers: { 'content-type': 'application/json' },body: JSON.stringify(body) }) })
    return { status: response.status,body: await response.text(),cache: response.headers.get('cache-control') }
  },{ path,body })
  const capture = path => hub.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST')
  const loseResponse = path => hub.evaluate(path => {
    const original = window.fetch.bind(window)
    window.fetch = async (input,init) => {
      const url = new URL(input instanceof Request ? input.url : String(input),location.href)
      if (url.origin === location.origin && url.pathname === path && init?.method === 'POST') {
        window.fetch = original
        const response = await original(input,init)
        if (!response.ok) return response
        await response.text()
        return new Response('Injected committed response loss',{ status: 503 })
      }
      return original(input,init)
    }
  },path)
  await region.getByLabel('所属租户',{ exact: true }).selectOption('1')
  await region.getByText('这个租户暂无建站申请。已有网站请从“我的网站”进入。',{ exact: true }).waitFor()
  await region.getByRole('button',{ name: '申请建站',exact: true }).click()
  await region.getByLabel('网站名称',{ exact: true }).fill('户外装备指南（云端测试）')
  await region.getByLabel('站点 ID',{ exact: true }).fill('cloud-admission-check')
  await region.getByLabel('负责人',{ exact: true }).selectOption('7')
  await region.getByLabel('网站时区',{ exact: true }).fill('Not/AZone')
  const invalid = capture('/auth/site-request')
  await region.getByRole('button',{ name: '提交申请',exact: true }).click()
  assert.equal((await invalid).status(),400)
  await region.getByText('请检查站点 ID、名称、租户、负责人和时区。',{ exact: true }).waitFor()
  await region.getByLabel('网站时区',{ exact: true }).fill('Europe/Berlin')
  await loseResponse('/auth/site-request')
  const sent = capture('/auth/site-request')
  await region.getByRole('button',{ name: '提交申请',exact: true }).click()
  const first = await sent,input = first.request().postDataJSON()
  assert.equal(first.status(),200)
  assert.deepEqual(Object.keys(input).sort(),['name','ownerUserId','requestId','siteId','tenantId','timezone'])
  await region.getByRole('button',{ name: '重试这次申请',exact: true }).waitFor()
  assert.equal(await region.getByLabel('站点 ID',{ exact: true }).isDisabled(),true)
  const replay = capture('/auth/site-request')
  await region.getByRole('button',{ name: '重试这次申请',exact: true }).click()
  const repeated = await replay
  assert.equal(repeated.status(),200); assert.deepEqual(repeated.request().postDataJSON(),input)
  assert.equal((await repeated.json()).replayed,true)
  const row = region.locator(`[data-request-id="${input.requestId}"]`)
  await row.getByText('等待执行',{ exact: true }).waitFor()
  assert.equal(await database.prepare('SELECT COUNT(*) AS n FROM site_provision_requests WHERE request_id=?').bind(input.requestId).first('n'),1)
  assert.equal(await database.prepare('SELECT COUNT(*) AS n FROM site_provision_operations').first('n'),0)
  const read = await invoke(`/auth/site-request?requestId=${input.requestId}`)
  assert.equal(read.status,200); assert.equal(read.cache,'private, no-store')
  assert.doesNotMatch(read.body,/prepared|databaseId|bindingName|workerGroup/)
  await row.getByRole('button',{ name: /^取消申请 / }).click()
  await row.getByRole('button',{ name: '保留申请',exact: true }).click()
  assert.equal(JSON.parse((await invoke(`/auth/site-request?requestId=${input.requestId}`)).body).state,'queued')
  await row.getByRole('button',{ name: /^取消申请 / }).click()
  await loseResponse('/auth/site-request-cancel')
  await row.getByRole('button',{ name: '确认取消申请',exact: true }).click()
  await row.getByRole('button',{ name: '重试取消',exact: true }).click()
  await row.getByText('已取消',{ exact: true }).waitFor()
  // One batched visual inspection: the same populated form and durable history
  // at desktop and phone widths. Only synthetic fixture data enters previews.
  await region.getByRole('button',{ name: '申请建站',exact: true }).click()
  await region.getByLabel('网站名称',{ exact: true }).fill('下一份户外指南申请')
  await region.getByLabel('站点 ID',{ exact: true }).fill('outdoor-next')
  for (const [viewport,width,height] of [['desktop',1365,900],['mobile',390,844]]) {
    await hub.setViewportSize({ width,height })
    await region.scrollIntoViewIfNeeded()
    assert.equal(await hub.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,'Admission must fit the viewport')
    const bytes = await region.screenshot({ type: 'jpeg',quality: 65,path: `.cloudflare-ci/admission-${viewport}.jpg` })
    const encoded = bytes.toString('base64')
    for (let index = 0; index < Math.ceil(encoded.length/4096); index++) console.log(JSON.stringify({ event: 'admission_ui_preview',viewport,index,
      total: Math.ceil(encoded.length/4096),data: encoded.slice(index*4096,(index+1)*4096) }))
  }
  await region.getByRole('button',{ name: '收起表单',exact: true }).click()
  await database.prepare("UPDATE users_roles SET value='site-manager' WHERE parent_id=7 AND value='super-admin'").run()
  try {
    assert.equal((await invoke('/auth/site-request',input)).status,403)
    assert.equal((await invoke('/auth/site-requests?tenantId=1')).status,403)
    assert.deepEqual(JSON.parse((await invoke('/auth/site-provision-options?kind=tenants')).body).choices,[])
    await region.getByRole('button',{ name: '刷新申请',exact: true }).click()
    await region.getByText('你已无权进行这项操作。请刷新页面查看当前权限。',{ exact: true }).waitFor()
    assert.equal(await region.locator('[data-request-id]').count(),0)
  } finally { await database.prepare("UPDATE users_roles SET value='super-admin' WHERE parent_id=7 AND value='site-manager'").run() }
  await region.getByRole('button',{ name: '刷新申请',exact: true }).click()
  await row.getByText('已取消',{ exact: true }).waitFor()
  await hub.setViewportSize({ width: 1365,height: 900 })
  console.log(JSON.stringify({ event: 'central_admission_browser_passed',checkedAt: new Date().toISOString(),remoteDeployment: false,
    requestId: input.requestId,checks: ['tenant-owner-form','invalid-timezone-recovery','committed-response-loss','same-request-retry','one-durable-request',
      'no-provision-effects','private-summary','cancel-confirmation','cancel-lost-response-retry','desktop-mobile','live-role-revocation'] }))
}
