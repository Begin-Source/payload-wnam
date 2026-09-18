'use client'

import React, { useEffect,useRef,useState } from 'react'
import Link from 'next/link'
import { Button } from '@payloadcms/ui'
import type { ProvisionAdmissionInput,ProvisionAdmissionPage,ProvisionAdmissionSummary,ProvisionChoicePage } from '../../site-control/provisionAdmission'
import './style.scss'

/* Operate extension of the existing central dashboard. Keep Payload typography,
 * theme tokens, small buttons and inline confirmation. Staff choose tenant and
 * owner, save one immutable request, and inspect its actual durable state.
 * No modal, infrastructure inputs, invented progress or automatic success. */
const labels = { queued: '等待执行',provisioning: '创建中',cancelled: '已取消',completed: '已建成' }
const failure = (status: number) => status === 401 ? <>登录已失效。<Link href="/admin/login">重新登录</Link>后重试。</> :
  status === 403 ? '你已无权进行这项操作。请刷新页面查看当前权限。' :
    status === 400 ? '请检查站点 ID、名称、租户、负责人和时区。' :
      status === 409 ? '站点 ID、负责人或申请状态已变化。请刷新申请列表后检查。' :
        '暂时无法确认结果。请重试这次操作；重试会使用同一申请。'
async function json<T>(path: string,body?: unknown): Promise<T> {
  const response = await fetch(path,{ credentials: 'same-origin',cache: 'no-store',signal: AbortSignal.timeout(20000),
    ...(body === undefined ? {} : { method: 'POST',headers: { 'content-type': 'application/json' },body: JSON.stringify(body) }) })
  if (!response.ok) throw response.status
  return response.json() as Promise<T>
}
function useChoices(kind: 'tenants' | 'owners',tenantId?: number) {
  const [after,setAfter] = useState(0),[retry,setRetry] = useState(0)
  const [choices,setChoices] = useState<ProvisionChoicePage['choices']>([]),[next,setNext] = useState<number | null>(null)
  const [error,setError] = useState(0),[loading,setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(0)
    const params = new URLSearchParams({ kind,...(after ? { after: String(after) } : {}),...(tenantId ? { tenantId: String(tenantId) } : {}) })
    void fetch(`/auth/site-provision-options?${params}`,{ credentials: 'same-origin',cache: 'no-store',signal: controller.signal })
      .then(async response => { if (!response.ok) throw response.status; return response.json() as Promise<ProvisionChoicePage> })
      .then(result => { if (!controller.signal.aborted) { setChoices(previous => after ? [...previous,...result.choices.filter(item => !previous.some(value => value.id === item.id))] : result.choices); setNext(result.nextAfter) } })
      .catch(error => { if (!controller.signal.aborted) { setChoices([]); setNext(null); setError(typeof error === 'number' ? error : 503) } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  },[kind,tenantId,after,retry])
  return { choices,next,error,loading,more: () => { if (next) setAfter(next) },retry: () => { setAfter(0); setRetry(value => value+1) } }
}
function OwnerChoice({ tenantId,value,onChange,disabled }: { tenantId: number; value: number; onChange: (id: number) => void; disabled: boolean }) {
  const data = useChoices('owners',tenantId)
  return <div className="central-provision__field">
    <label htmlFor="provision-owner">负责人</label>
    <select id="provision-owner" required value={value || ''} disabled={disabled || data.loading || Boolean(data.error)} onChange={event => onChange(Number(event.target.value))}>
      <option value="">{data.loading ? '正在加载负责人…' : '请选择负责人'}</option>
      {data.choices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
    {data.next && <Button buttonStyle="secondary" size="small" disabled={disabled || data.loading} onClick={data.more}>加载更多负责人</Button>}
    {!data.loading && !data.error && !data.choices.length && <p>这个租户暂无可选负责人。请先由管理员分配人员。</p>}
    {data.error > 0 && <div role="alert">{failure(data.error)} <Button buttonStyle="secondary" size="small" onClick={data.retry}>重新加载负责人</Button></div>}
  </div>
}
function CancelRequest({ request,onChanged }: { request: ProvisionAdmissionSummary; onChanged: () => void }) {
  const [confirm,setConfirm] = useState(false),[busy,setBusy] = useState(false),[error,setError] = useState(0)
  const guard = useRef(false),panel = useRef<HTMLDivElement>(null),trigger = useRef<HTMLDivElement>(null)
  useEffect(() => { if (confirm) panel.current?.focus() },[confirm])
  const cancel = async () => {
    if (guard.current) return
    guard.current = true; setBusy(true); setError(0)
    try { await json('/auth/site-request-cancel',{ requestId: request.requestId }); onChanged() }
    catch (error) { setError(typeof error === 'number' ? error : 503) }
    finally { guard.current = false; setBusy(false) }
  }
  if (request.state !== 'queued') return null
  return <>
    <div ref={trigger}><Button buttonStyle="secondary" size="small" disabled={confirm} onClick={() => setConfirm(true)} aria-label={`取消申请 ${request.input.name}`}>取消申请</Button></div>
    {confirm && <div className="central-provision__confirmation" ref={panel} tabIndex={-1} role="group" aria-label={`确认取消 ${request.input.name}`}>
      <p>取消「{request.input.name}」的建站申请？如果创建已经开始，这次取消不会执行。</p>
      {error > 0 && <p role="alert">{failure(error)}</p>}
      <div className="central-provision__actions">
        {![401,403,409].includes(error) && <Button size="small" disabled={busy} onClick={() => void cancel()}>{busy ? '正在取消…' : error ? '重试取消' : '确认取消申请'}</Button>}
        <Button buttonStyle="secondary" size="small" disabled={busy} onClick={() => {
          if (error) onChanged()
          else { setConfirm(false); requestAnimationFrame(() => trigger.current?.querySelector('button')?.focus()) }
        }}>{error ? '刷新申请状态' : '保留申请'}</Button>
      </div>
    </div>}
  </>
}
export function CentralProvisionRequests() {
  const tenants = useChoices('tenants')
  const [tenant,setTenant] = useState(0),[owner,setOwner] = useState(0),[name,setName] = useState(''),[siteId,setSiteId] = useState(''),[timezone,setTimezone] = useState('UTC')
  const [open,setOpen] = useState(false),[attempt,setAttempt] = useState<ProvisionAdmissionInput | null>(null),[busy,setBusy] = useState(false),[submitError,setSubmitError] = useState(0)
  const [data,setData] = useState<ProvisionAdmissionPage | null>(null),[cursors,setCursors] = useState(['']),[refresh,setRefresh] = useState(0),[loading,setLoading] = useState(false),[listError,setListError] = useState(0),[notice,setNotice] = useState('')
  const guard = useRef(false),formTitle = useRef<HTMLHeadingElement>(null),cursor = cursors[cursors.length-1]
  useEffect(() => { if (open) formTitle.current?.focus() },[open])
  useEffect(() => {
    const controller = new AbortController()
    setData(null); setListError(0)
    if (!tenant) { setLoading(false); return () => controller.abort() }
    setLoading(true)
    const params = new URLSearchParams({ tenantId: String(tenant),...(cursor ? { after: cursor } : {}) })
    void fetch(`/auth/site-requests?${params}`,{ credentials: 'same-origin',cache: 'no-store',signal: controller.signal })
      .then(async response => { if (!response.ok) throw response.status; return response.json() as Promise<ProvisionAdmissionPage> })
      .then(result => { if (!controller.signal.aborted) setData(result) })
      .catch(error => { if (!controller.signal.aborted) setListError(typeof error === 'number' ? error : 503) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  },[tenant,cursor,refresh])
  const reload = () => { setCursors(['']); setRefresh(value => value+1) }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (guard.current) return
    guard.current = true; setBusy(true); setSubmitError(0); setNotice('')
    const input = attempt ?? { requestId: crypto.randomUUID(),siteId,name,tenantId: tenant,ownerUserId: owner,timezone }
    setAttempt(input)
    try {
      const result = await json<ProvisionAdmissionSummary>('/auth/site-request',input)
      setNotice(result.state === 'cancelled' ? '这份申请已取消。' : result.state === 'queued' ? '申请已保存，等待执行。' : `申请状态：${labels[result.state]}。`)
      setAttempt(null); setOpen(false); setName(''); setSiteId(''); reload()
    } catch (error) {
      const status = typeof error === 'number' ? error : 503
      setSubmitError(status)
      if ([400,409].includes(status)) setAttempt(null)
    } finally { guard.current = false; setBusy(false) }
  }
  if (!tenants.loading && !tenants.error && !tenants.choices.length) return null
  return <section className="central-provision" aria-labelledby="central-provision-heading">
    <h2 id="central-provision-heading">建站申请</h2>
    <p>选择租户后提交申请或查看进度。自动执行尚未启用，申请会保留待处理。</p>
    <div className="central-provision__field central-provision__tenant">
      <label htmlFor="provision-tenant">所属租户</label>
      <select id="provision-tenant" value={tenant || ''} disabled={busy || Boolean(attempt) || tenants.loading || Boolean(tenants.error)} onChange={event => {
        setTenant(Number(event.target.value)); setOwner(0); setCursors(['']); setNotice(''); setSubmitError(0)
      }}>
        <option value="">{tenants.loading ? '正在加载租户…' : '请选择租户'}</option>
        {tenants.choices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      {tenants.next && <Button buttonStyle="secondary" size="small" disabled={tenants.loading || busy || Boolean(attempt)} onClick={tenants.more}>加载更多租户</Button>}
      {tenants.error > 0 && <div role="alert">{failure(tenants.error)} <Button buttonStyle="secondary" size="small" onClick={tenants.retry}>重新加载租户</Button></div>}
    </div>
    {tenant > 0 && <>
      <div className="central-provision__actions">
        <Button size="small" disabled={busy || Boolean(attempt)} aria-expanded={open} aria-controls="provision-form" onClick={() => setOpen(value => !value)}>{open ? '收起表单' : '申请建站'}</Button>
        <Button buttonStyle="secondary" size="small" disabled={loading} onClick={reload}>刷新申请</Button>
      </div>
      {open && <form id="provision-form" className="central-provision__form" onSubmit={event => void submit(event)} aria-busy={busy}>
        <h3 ref={formTitle} tabIndex={-1}>新建站点申请</h3>
        <div className="central-provision__fields">
          <div className="central-provision__field"><label htmlFor="provision-name">网站名称</label>
            <input id="provision-name" required maxLength={120} value={name} disabled={Boolean(attempt)} onChange={event => setName(event.target.value)} /></div>
          <div className="central-provision__field"><label htmlFor="provision-site-id">站点 ID</label>
            <input id="provision-site-id" required maxLength={48} pattern={'[a-z0-9]([a-z0-9\\-]{0,46}[a-z0-9])?'} autoCapitalize="none" spellCheck={false} value={siteId} disabled={Boolean(attempt)} onChange={event => setSiteId(event.target.value)} aria-describedby="provision-id-help" />
            <p id="provision-id-help">使用小写字母、数字或连字符，例如 outdoor-guide。提交后不可更改。</p></div>
          <OwnerChoice key={tenant} tenantId={tenant} value={owner} onChange={setOwner} disabled={Boolean(attempt)} />
          <div className="central-provision__field"><label htmlFor="provision-timezone">网站时区</label>
            <input id="provision-timezone" required maxLength={64} value={timezone} disabled={Boolean(attempt)} onChange={event => setTimezone(event.target.value)} aria-describedby="provision-timezone-help" />
            <p id="provision-timezone-help">用于发布排期，例如 UTC、Europe/Berlin 或 Asia/Shanghai。</p></div>
        </div>
        {submitError > 0 && <p role="alert">{failure(submitError)}</p>}
        <Button type="submit" size="small" disabled={busy || !owner || [401,403].includes(submitError)}>{busy ? '正在保存…' : attempt ? '重试这次申请' : '提交申请'}</Button>
      </form>}
      <div aria-live="polite" aria-busy={loading}>
        {notice && <p role="status">{notice}</p>}
        {loading && <p>正在加载申请…</p>}
        {listError > 0 && <p role="alert">{failure(listError)}</p>}
        {!loading && !listError && data && <>
          {data.requests.length ? <ul className="central-provision__list">{data.requests.map(request => <li key={request.requestId} className="central-provision__row" data-request-id={request.requestId}>
            <div className="central-provision__identity"><strong>{request.input.name}</strong><span>站点 ID：{request.input.siteId}</span>
              <span>提交于 <time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleString('zh-CN',{ timeZone: 'UTC' })} UTC</time></span></div>
            <span>{labels[request.state]}</span>
            <CancelRequest request={request} onChanged={() => { setNotice('已更新申请状态。'); reload() }} />
          </li>)}</ul> : <p>这个租户暂无建站申请。已有网站请从“我的网站”进入。</p>}
          <nav className="central-provision__pages" aria-label="建站申请分页">
            <Button buttonStyle="secondary" size="small" disabled={cursors.length === 1} onClick={() => setCursors(values => values.slice(0,-1))}>上一页申请</Button>
            <span>第 {cursors.length} 页</span>
            <Button buttonStyle="secondary" size="small" disabled={!data.nextCursor} onClick={() => { if (data.nextCursor) setCursors(values => [...values,data.nextCursor!]) }}>下一页申请</Button>
          </nav>
        </>}
      </div>
    </>}
  </section>
}
