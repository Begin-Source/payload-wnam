'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@payloadcms/ui'
import type { SiteDirectoryEntry } from '../../site-control/siteDirectory'
import type { SiteLifecycleInput } from '../../site-control/siteLifecycle'

export function LifecycleControl({ site, onChanged }: { site: SiteDirectoryEntry; onChanged: (message: string) => void }) {
  const [operation, setOperation] = useState<SiteLifecycleInput | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<number | null>(null)
  const [attempted, setAttempted] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLDivElement>(null)
  const label = site.state === 'active' ? '暂停' : '恢复'
  useEffect(() => { if (operation) panel.current?.focus() }, [operation])
  if (site.role !== 'manager' || !['active','paused'].includes(site.state)) return null

  async function submit() {
    if (!operation || busy) return
    setBusy(true); setFailure(null); setAttempted(true)
    try {
      const response = await fetch('/auth/site-lifecycle',{ method: 'POST',credentials: 'same-origin',cache: 'no-store',
        signal: AbortSignal.timeout(20000),
        headers: { 'content-type': 'application/json' },body: JSON.stringify(operation) })
      if (!response.ok) { setFailure(response.status); return }
      onChanged(`${site.name}已${label}。${label === '恢复' ? '请重新进入网站。' : ''}`)
    } catch { setFailure(503) }
    finally { setBusy(false) }
  }

  return <>
    <div ref={trigger}>
      <Button buttonStyle="secondary" size="small" disabled={Boolean(operation)} aria-label={`${label}网站 ${site.name}`}
        onClick={() => setOperation({ siteId: site.siteId,action: site.state === 'active' ? 'pause' : 'resume',
          expectedRoutingVersion: site.routingVersion,operationId: crypto.randomUUID() })}>{label}网站</Button>
    </div>
    {operation && <div className="central-sites__confirmation" role="group" aria-label={`确认${label} ${site.name}`} tabIndex={-1} ref={panel}>
      <p>{label}「{site.name}」？{label === '暂停' ? '暂停后，员工将无法访问本站后台。恢复后需重新进入。' : '恢复后，已获授权的员工可以重新进入本站后台。'}</p>
      {failure && <p role="alert">{failure === 401 ? <>登录已失效。<Link href="/admin/login">重新登录</Link>后查看网站状态。</> :
        failure === 403 ? '你已无权管理这个网站。请刷新列表。' : failure === 409 ? '网站状态已变化。请刷新列表后重新选择操作。' :
          '尚未确认操作结果。请重试以查询或完成这次操作，也可刷新列表查看当前状态。'}</p>}
      <div className="central-sites__actions">
        {![401,403,409].includes(failure ?? 0) && <Button size="small" disabled={busy} onClick={() => void submit()}>
          {busy ? '正在处理…' : failure ? '重试这次操作' : `确认${label}`}</Button>}
        <Button buttonStyle="secondary" size="small" disabled={busy} onClick={() => {
          if (attempted) onChanged('已刷新网站状态。')
          else { setOperation(null); requestAnimationFrame(() => trigger.current?.querySelector('button')?.focus()) }
        }}>{attempted ? '刷新列表' : '取消'}</Button>
      </div>
    </div>}
  </>
}
