'use client'

import Link from 'next/link'
import React, { useEffect, useMemo, useState } from 'react'

import './style.scss'

type WorkbenchItem = {
  id: string
  source: string
  sourceLabel: string
  title: string
  target: string
  kind: 'completed' | 'exception' | 'review' | 'settlement'
  priority: 'high' | 'medium' | 'low'
  status: string
  summary: string
  nextAction: string
  updatedAt: string
  href: string
}

type WorkbenchResponse = {
  view: 'executive' | 'operations' | 'finance' | 'system' | 'public'
  mode: 'finance' | 'management' | 'personal' | 'public' | 'system'
  items: WorkbenchItem[]
}

const statusLabels: Record<string, string> = {
  approved: '已批准',
  completed: '已完成',
  draft: '待核算',
  error: '失败',
  failed: '失败',
  failed_partial: '部分失败',
  needs_input: '待输入',
  open_loop: '待核实',
  paid: '已付款',
  veto: '阻断',
  warn: '警告',
}

const kindLabels: Record<WorkbenchItem['kind'], string> = {
  completed: '已完成',
  exception: '异常',
  review: '待核实',
  settlement: '待结算',
}

const priorityLabels = { high: '高', medium: '中', low: '低' }
const priorityOrder = { high: 3, medium: 2, low: 1 }

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function exportRows(rows: WorkbenchItem[]): void {
  const header = ['来源', '事项', '对象', '类型', '优先级', '状态', '下一步', '更新时间']
  const body = rows.map((row) =>
    [
      row.sourceLabel,
      row.title,
      row.target,
      kindLabels[row.kind],
      priorityLabels[row.priority],
      statusLabels[row.status] ?? row.status,
      row.nextAction,
      row.updatedAt,
    ]
      .map(csvCell)
      .join(','),
  )
  const blob = new Blob([`\uFEFF${[header.map(csvCell).join(','), ...body].join('\n')}`], {
    type: 'text/csv;charset=utf-8',
  })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = `agenthub-workbench-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(href)
}

export function AgentWorkbench(): React.ReactElement {
  const [data, setData] = useState<WorkbenchResponse | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'attention' | 'completed'>('attention')
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('')
  const [priority, setPriority] = useState('')
  const [sort, setSort] = useState<'priority' | 'title' | 'updatedAt'>('priority')
  const [descending, setDescending] = useState(true)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/admin/workbench', {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(response.status === 401 ? '请重新登录' : `加载失败 (${response.status})`)
        return response.json() as Promise<WorkbenchResponse>
      })
      .then((result) => {
        if (!controller.signal.aborted) setData(result)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : '加载失败')
      })
    return () => controller.abort()
  }, [])

  const attentionCount = data?.items.filter((item) => item.kind !== 'completed').length ?? 0
  const completedCount = data?.items.filter((item) => item.kind === 'completed').length ?? 0
  const visible = useMemo(() => {
    if (!data) return []
    const term = search.trim().toLocaleLowerCase()
    const rows = data.items.filter((item) => {
      if (tab === 'attention' ? item.kind === 'completed' : item.kind !== 'completed') return false
      if (kind && item.kind !== kind) return false
      if (priority && item.priority !== priority) return false
      return (
        !term ||
        [item.title, item.target, item.sourceLabel, item.summary, item.nextAction]
          .join(' ')
          .toLocaleLowerCase()
          .includes(term)
      )
    })
    return rows.sort((left, right) => {
      const value =
        sort === 'priority'
          ? priorityOrder[left.priority] - priorityOrder[right.priority]
          : sort === 'title'
            ? left.title.localeCompare(right.title, 'zh-CN')
            : left.updatedAt.localeCompare(right.updatedAt)
      return descending ? -value : value
    })
  }, [data, tab, search, kind, priority, sort, descending])

  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = visible.slice((safePage - 1) * pageSize, safePage * pageSize)
  const selectedRows = data?.items.filter((item) => selected.has(item.id)) ?? []
  const allPageSelected = pageRows.length > 0 && pageRows.every((item) => selected.has(item.id))
  const resetPage = () => setPage(1)
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (error)
    return (
      <p className="agent-workbench__error" role="alert">
        {error}
      </p>
    )
  if (!data) return <p className="agent-workbench__loading">正在加载今日工作…</p>
  if (data.view === 'public') return <></>

  return (
    <section className="agent-workbench" aria-labelledby="agent-workbench-title">
      <div className="agent-workbench__heading">
        <div>
          <h2 id="agent-workbench-title">
            {data.mode === 'finance'
              ? '财务待办'
              : data.mode === 'system'
                ? '技术待办'
                : data.mode === 'management'
                  ? '管理决策'
                  : '今日工作'}
          </h2>
          <p>
            {data.mode === 'management'
              ? '只显示需要主管决策或接管的升级事项；普通网站事务仍由站长处理。'
              : 'Agent 持续执行；这里集中显示需要人工决定、核验或接管的真实事项。'}
          </p>
        </div>
        <div className="agent-workbench__summary" aria-label="工作台摘要">
          <span>
            <strong>{attentionCount}</strong> 待处理
          </span>
          <span>
            <strong>
              {
                data.items.filter((item) => item.priority === 'high' && item.kind !== 'completed')
                  .length
              }
            </strong>{' '}
            高优先级
          </span>
          <span>
            <strong>{completedCount}</strong> 最近完成
          </span>
        </div>
      </div>

      <div className="agent-workbench__tabs" role="tablist" aria-label="工作分类">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'attention'}
          onClick={() => {
            setTab('attention')
            resetPage()
          }}
        >
          待我处理 <span>{attentionCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'completed'}
          onClick={() => {
            setTab('completed')
            resetPage()
          }}
        >
          最近完成 <span>{completedCount}</span>
        </button>
      </div>

      <div className="agent-workbench__panel" role="tabpanel">
        <div className="agent-workbench__filters">
          <label className="agent-workbench__search">
            <span className="sr-only">搜索工作事项</span>
            <input
              type="search"
              placeholder="搜索事项、站点、来源或下一步…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                resetPage()
              }}
            />
          </label>
          <label>
            类型
            <select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value)
                resetPage()
              }}
            >
              <option value="">全部</option>
              <option value="exception">异常</option>
              <option value="review">待核实</option>
              <option value="settlement">待结算</option>
              <option value="completed">已完成</option>
            </select>
          </label>
          <label>
            优先级
            <select
              value={priority}
              onChange={(event) => {
                setPriority(event.target.value)
                resetPage()
              }}
            >
              <option value="">全部</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </label>
          <label>
            排序
            <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
              <option value="priority">优先级</option>
              <option value="updatedAt">更新时间</option>
              <option value="title">名称</option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn--style-secondary btn--size-small"
            onClick={() => setDescending((value) => !value)}
          >
            {descending ? '降序' : '升序'}
          </button>
        </div>

        <div className="agent-workbench__meta">
          <label>
            <input
              type="checkbox"
              checked={allPageSelected}
              onChange={() =>
                setSelected((current) => {
                  const next = new Set(current)
                  for (const item of pageRows)
                    allPageSelected ? next.delete(item.id) : next.add(item.id)
                  return next
                })
              }
            />{' '}
            选择本页
          </label>
          <span>{visible.length} 条结果</span>
        </div>

        {selectedRows.length > 0 && (
          <div className="agent-workbench__selection">
            <strong>已选 {selectedRows.length} 项</strong>
            <button type="button" onClick={() => setSelected(new Set())}>
              清除
            </button>
            <span />
            <button type="button" onClick={() => exportRows(selectedRows)}>
              导出所选 CSV
            </button>
          </div>
        )}

        {pageRows.length === 0 ? (
          <p className="agent-workbench__empty">当前筛选条件下没有事项。</p>
        ) : (
          <div className="agent-workbench__table-wrap">
            <table className="agent-workbench__table">
              <thead>
                <tr>
                  <th aria-label="选择" />
                  <th>事项</th>
                  <th>类型</th>
                  <th>对象</th>
                  <th>优先级</th>
                  <th>状态</th>
                  <th>更新时间</th>
                  <th aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((item) => (
                  <React.Fragment key={item.id}>
                    <tr className={selected.has(item.id) ? 'is-selected' : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          aria-label={`选择 ${item.title}`}
                          onChange={() => toggle(item.id)}
                        />
                      </td>
                      <td className="agent-workbench__primary">
                        <strong>{item.title}</strong>
                        <small>{item.sourceLabel}</small>
                        <span className="agent-workbench__mobile">
                          {item.target} · {priorityLabels[item.priority]}优先级
                        </span>
                      </td>
                      <td>
                        <span className={`agent-workbench__kind is-${item.kind}`}>
                          {kindLabels[item.kind]}
                        </span>
                      </td>
                      <td>{item.target}</td>
                      <td>{priorityLabels[item.priority]}</td>
                      <td>
                        <span className={`agent-workbench__status is-${item.status}`}>
                          {statusLabels[item.status] ?? item.status}
                        </span>
                      </td>
                      <td>
                        {item.updatedAt ? new Date(item.updatedAt).toLocaleString('zh-CN') : '—'}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="agent-workbench__detail-button"
                          aria-expanded={expanded === item.id}
                          onClick={() =>
                            setExpanded((value) => (value === item.id ? null : item.id))
                          }
                        >
                          {expanded === item.id ? '收起' : '详情'}
                        </button>
                      </td>
                    </tr>
                    {expanded === item.id && (
                      <tr className="agent-workbench__detail">
                        <td colSpan={8}>
                          <div>
                            <section>
                              <span>情况</span>
                              <p>{item.summary}</p>
                            </section>
                            <section>
                              <span>下一步</span>
                              <p>{item.nextAction}</p>
                            </section>
                            <section>
                              <span>来源</span>
                              <p>{item.sourceLabel}</p>
                            </section>
                            <footer>
                              <Link
                                className="btn btn--style-primary btn--size-small"
                                href={item.href}
                              >
                                打开来源记录
                              </Link>
                            </footer>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="agent-workbench__pagination" aria-label="分页">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            上一页
          </button>
          <span>
            第 {safePage} / {totalPages} 页
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            下一页
          </button>
        </div>
      </div>
    </section>
  )
}
