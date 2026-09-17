import assert from 'node:assert/strict'

/** Runs only inside Cloudflare's complete Worker/browser and remote release
 * checks. Uses the real central UI and API; no direct SQL lifecycle mutations. */
export async function checkLifecycleBrowser({ hub,siteId,otherSiteId,siteRequest,otherSiteRequest,artifactPrefix }) {
  const progress = step => console.log(JSON.stringify({ event: 'p1_lifecycle_step',siteId,step }))
  progress('read-initial-state')
  const invoke = (path,init = {}) => hub.evaluate(async ({ path,init }) => {
    const response = await fetch(path,{ ...init,signal: AbortSignal.timeout(20000) })
    return { status: response.status,body: await response.text() }
  },{ path,init })
  const read = async id => {
    const response = await invoke(`/auth/site?siteId=${id}`)
    assert.equal(response.status,200); return JSON.parse(response.body)
  }
  const write = operation => invoke('/auth/site-lifecycle',{ method: 'POST',headers: { 'content-type': 'application/json' },body: JSON.stringify(operation) })
  const initial = await read(siteId), other = otherSiteId ? await read(otherSiteId) : null
  assert.equal(initial.state,'active'); assert.equal(initial.role,'manager')
  const chooser = hub.getByRole('region',{ name: '我的网站' })
  const row = chooser.locator(`[data-site-id="${siteId}"]`)
  const capture = () => hub.waitForResponse(response => new URL(response.url()).pathname === '/auth/site-lifecycle' && response.request().method() === 'POST')
  let attempted = false, pauseOperation
  try {
    assert.equal((await write({ action: 'pause',expectedRoutingVersion: initial.routingVersion,operationId: crypto.randomUUID() })).status,400)
    assert.equal((await write({ siteId: 'unassigned-site',action: 'pause',expectedRoutingVersion: 1,operationId: crypto.randomUUID() })).status,403)
    await row.getByRole('button',{ name: /^暂停网站 / }).click()
    await row.getByRole('button',{ name: '取消',exact: true }).click()
    assert.equal((await read(siteId)).routingVersion,initial.routingVersion,'Cancel must not change state')
    progress('cancel-passed')
    await hub.setViewportSize({ width: 390,height: 844 })
    await row.getByRole('button',{ name: /^暂停网站 / }).click()
    await row.getByRole('group',{ name: /^确认暂停 / }).waitFor()
    assert.equal(await hub.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,'Manager confirmation must fit a phone')
    await hub.screenshot({ path: `${artifactPrefix}-confirmation-mobile.png`,fullPage: true })
    if (artifactPrefix.includes('remote')) {
      // Only this synthetic chooser region, with no credentials or user profile.
      // Bounded chunks preserve a reviewable remote screenshot in CI evidence.
      const preview = (await chooser.screenshot({ type: 'jpeg',quality: 60 })).toString('base64')
      for (let index = 0; index < Math.ceil(preview.length/4096); index++) console.log(JSON.stringify({
        event: 'p1_lifecycle_mobile_preview',index,total: Math.ceil(preview.length/4096),data: preview.slice(index*4096,(index+1)*4096),
      }))
    }
    attempted = true
    const pending = capture()
    const sent = hub.waitForRequest(request => new URL(request.url()).pathname === '/auth/site-lifecycle' && request.method() === 'POST')
    await row.getByRole('button',{ name: '确认暂停',exact: true }).click()
    pauseOperation = (await sent).postDataJSON()
    const paused = await pending
    assert.equal(paused.status(),200)
    progress('pause-response')
    await row.getByText('已暂停',{ exact: true }).waitFor()
    assert.equal(await row.getByRole('button',{ name: /^进入网站 / }).isDisabled(),true)
    const pauseReceipt = await paused.json()
    assert.equal(pauseReceipt.routingVersion,initial.routingVersion+1)
    const replay = await write(pauseOperation)
    assert.equal(replay.status,200); assert.equal(JSON.parse(replay.body).replayed,true)
    assert.equal((await write({ ...pauseOperation,operationId: crypto.randomUUID() })).status,409,'A different stale operation must fail')
    if (siteRequest) assert.equal((await siteRequest()).status,503,'Paused routing must immediately deny an existing site session')
    if (otherSiteRequest) assert.equal((await otherSiteRequest()).status,200,'Pause must not affect the other site')
    await row.getByRole('button',{ name: /^恢复网站 / }).click()
    const resuming = capture()
    await row.getByRole('button',{ name: '确认恢复',exact: true }).click()
    assert.equal((await resuming).status(),200)
    await row.getByText('可进入',{ exact: true }).waitFor()
    assert.equal((await read(siteId)).routingVersion,initial.routingVersion+2)
    progress('first-resume-passed')
    if (siteRequest) assert.equal((await siteRequest()).status,403,'Resume must not resurrect the old site cookie')
    if (other) assert.deepEqual(await read(otherSiteId),other)
    // Simulate an ambiguous delivery: the backend commits but the UI sees 503.
    // Retry must submit exactly the same operation ID and receive its receipt.
    // Keep the actual request in Chromium. route.fetch() uses Node networking
    // and would bypass the fixture's browser host-resolver mapping.
    await hub.evaluate(() => {
      const original = window.fetch.bind(window)
      window.__p1OriginalFetch = original
      window.fetch = async (input,init) => {
        const url = new URL(input instanceof Request ? input.url : String(input),location.href)
        if (url.origin === location.origin && url.pathname === '/auth/site-lifecycle' && (init?.method ?? 'GET') === 'POST') {
          window.fetch = original
          const response = await original(input,init)
          if (!response.ok) return response
          await response.text()
          return new Response('Injected lost response',{ status: 503,headers: { 'content-type': 'text/plain' } })
        }
        return original(input,init)
      }
    })
    await row.getByRole('button',{ name: /^暂停网站 / }).click()
    const ambiguousRequest = hub.waitForRequest(request => new URL(request.url()).pathname === '/auth/site-lifecycle' && request.method() === 'POST')
    await row.getByRole('button',{ name: '确认暂停',exact: true }).click()
    const ambiguousOperation = (await ambiguousRequest).postDataJSON()
    pauseOperation = ambiguousOperation
    await row.getByRole('button',{ name: '重试这次操作',exact: true }).waitFor()
    const retry = capture()
    await row.getByRole('button',{ name: '重试这次操作',exact: true }).click()
    const retried = await retry
    assert.deepEqual(retried.request().postDataJSON(),ambiguousOperation)
    assert.equal((await retried.json()).replayed,true)
    progress('ambiguous-retry-passed')
    await row.getByText('已暂停',{ exact: true }).waitFor()
    await row.getByRole('button',{ name: /^恢复网站 / }).click()
    const resumed = capture()
    await row.getByRole('button',{ name: '确认恢复',exact: true }).click()
    assert.equal((await resumed).status(),200)
    await row.getByText('可进入',{ exact: true }).waitFor()
    assert.equal((await read(siteId)).routingVersion,initial.routingVersion+4)
    await hub.setViewportSize({ width: 1365,height: 900 })
    await hub.screenshot({ path: `${artifactPrefix}-restored-desktop.png`,fullPage: true })
    console.log(JSON.stringify({ event: 'p1_lifecycle_browser_passed',siteId,fromVersion: initial.routingVersion,toVersion: initial.routingVersion+4,
      checks: ['explicit-site-id','manager-ui','cancel','mobile','pause','idempotent-retry','stale-conflict','resume','ambiguous-response-retry',...(siteRequest ? ['old-cookie-denied','other-site-unaffected'] : [])] }))
  } finally {
    await hub.evaluate(() => {
      if (window.__p1OriginalFetch) { window.fetch = window.__p1OriginalFetch; delete window.__p1OriginalFetch }
    })
    if (attempted) {
      const current = await read(siteId)
      if (current.state === 'paused') {
        // Only recover our expected pause; never overwrite an unrelated route
        // change or migration. One ID is reused if recovery's response is lost.
        assert.ok([initial.routingVersion+1,initial.routingVersion+3].includes(current.routingVersion),'Unexpected lifecycle state during recovery')
        assert.ok(pauseOperation,'Recovery requires the original pause operation')
        const original = await write(pauseOperation)
        assert.equal(original.status,200,'Only our own committed pause may be recovered')
        assert.equal(JSON.parse(original.body).routingVersion,current.routingVersion)
        const recovery = { siteId,action: 'resume',expectedRoutingVersion: current.routingVersion,operationId: crypto.randomUUID() }
        let restored = false
        for (let attempt = 0; attempt < 3 && !restored; attempt++) {
          try { restored = (await write(recovery)).status === 200 } catch { /* retry the same operation */ }
        }
        assert.equal(restored,true,'Lifecycle smoke recovery must restore the test site')
        assert.equal((await read(siteId)).state,'active')
      }
    }
  }
}
