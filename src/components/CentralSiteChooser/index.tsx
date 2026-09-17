'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@payloadcms/ui'
import type { SiteDirectoryPage } from '../../site-control/siteDirectory'
import './style.scss'

const roles = { viewer: '只读', editor: '编辑', publisher: '发布', manager: '管理' }
const states = { active: '可进入', provisioning: '准备中', paused: '已暂停', migrating: '迁移中', retired: '已停用' }

export function CentralSiteChooser() {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [cursors, setCursors] = useState([''])
  const [data, setData] = useState<SiteDirectoryPage | null>(null)
  const [error, setError] = useState<null | 'login' | 'unavailable'>(null)
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [entering, setEntering] = useState<string | null>(null)
  const cursor = cursors[cursors.length - 1]

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(null); setData(null)
    const params = new URLSearchParams({ q: query, after: cursor })
    void (async () => {
      try {
        const response = await fetch(`/auth/sites?${params}`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
        if (!response.ok) { if (!controller.signal.aborted) setError(response.status === 401 ? 'login' : 'unavailable'); return }
        const result = await response.json() as SiteDirectoryPage
        if (!controller.signal.aborted) setData(result)
      } catch { if (!controller.signal.aborted) setError('unavailable') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    })()
    return () => controller.abort()
  }, [query, cursor, retry])

  // A browser history return must allow another entry after a successful POST.
  useEffect(() => {
    const reset = () => setEntering(null)
    window.addEventListener('pageshow', reset)
    return () => window.removeEventListener('pageshow', reset)
  }, [])

  return <section className="central-sites" aria-labelledby="central-sites-heading">
    <h2 id="central-sites-heading">我的网站</h2>
    <p>选择网站，进入该站编辑后台。</p>
    <form className="central-sites__search" role="search" onSubmit={event => {
      event.preventDefault(); setQuery(input.trim()); setCursors(['']); setRetry(value => value + 1)
    }}>
      <label htmlFor="central-sites-query">查找网站</label>
      <input id="central-sites-query" type="search" maxLength={120} value={input} placeholder="网站名称或站点 ID"
        onChange={event => setInput(event.target.value)} />
      <Button type="submit" buttonStyle="secondary" size="small" disabled={Boolean(entering)}>查找</Button>
    </form>
    <div aria-live="polite" aria-busy={loading}>
      {loading && <p>正在加载网站…</p>}
      {error === 'login' && <p role="alert">登录已失效。<a href="/admin/login">重新登录</a>后查看网站。</p>}
      {error === 'unavailable' && <div role="alert"><p>暂时无法加载网站，请重试。</p>
        <Button buttonStyle="secondary" size="small" onClick={() => setRetry(value => value + 1)}>重新加载</Button></div>}
      {!loading && !error && data && <>
        {data.sites.length === 0 ? <p>{query ? '没有匹配的网站。请修改名称或站点 ID 后重试。' : '暂无已分配的网站。请联系管理员分配站点权限。'}</p> :
          <ul className="central-sites__list">{data.sites.map(site => <li key={site.siteId} className="central-sites__row" data-site-id={site.siteId}>
            <div className="central-sites__identity"><strong>{site.name}</strong><span>站点 ID：{site.siteId}</span></div>
            <span aria-label={`站点角色：${roles[site.role]}`}>{roles[site.role]}</span>
            <span>{states[site.state]}</span>
            <form action="/auth/enter-site" method="post" onSubmit={() => setEntering(site.siteId)}>
              <input type="hidden" name="siteId" value={site.siteId} />
              <Button type="submit" size="small" disabled={site.state !== 'active' || Boolean(entering)}
                aria-label={`进入网站 ${site.name}`}>
                {entering === site.siteId ? '正在进入…' : '进入网站'}
              </Button>
            </form>
          </li>)}</ul>}
        <nav className="central-sites__pages" aria-label="网站列表分页">
          <Button buttonStyle="secondary" size="small" disabled={cursors.length === 1 || Boolean(entering)}
            onClick={() => setCursors(value => value.slice(0,-1))}>上一页</Button>
          <span>第 {cursors.length} 页</span>
          <Button buttonStyle="secondary" size="small" disabled={!data.nextCursor || Boolean(entering)}
            onClick={() => { if (data.nextCursor) setCursors(value => [...value,data.nextCursor!]) }}>下一页</Button>
        </nav>
      </>}
    </div>
  </section>
}
