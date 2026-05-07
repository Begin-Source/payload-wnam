'use client'

import { Gutter } from '@payloadcms/ui'
import Link from 'next/link'
import React, { useCallback, useEffect, useState } from 'react'

import { PipelineProfilesKpiCompareSection } from '@/components/PipelineProfilesKpiCompareSection'

const cardStyle: React.CSSProperties = {
  padding: '1rem',
  borderRadius: 8,
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-50)',
  marginBottom: '1rem',
}

const linkButtonStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.45rem 0.85rem',
  borderRadius: 6,
  border: '1px solid var(--theme-elevation-150)',
  fontSize: '0.8125rem',
  textDecoration: 'none',
  color: 'inherit',
  marginRight: '0.5rem',
  marginBottom: '0.5rem',
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.4rem 0.5rem',
  borderBottom: '1px solid var(--theme-elevation-150)',
}
const tdStyle: React.CSSProperties = {
  padding: '0.35rem 0.5rem',
  borderBottom: '1px solid var(--theme-elevation-100)',
  verticalAlign: 'top',
}

type SummaryJson = {
  tenantId?: number
  days?: number
  strategyPairs?: Array<{
    pipelineProfileId: number | null
    keywordBatchPresetId: number | null
    pipelineProfileName: string
    pipelineProfileSlug: string
    keywordPresetName: string
    keywordPresetSlug: string
    label: string
    siteCount: number
    clickCount: number
    commissionSum: number | null
  }>
  pipelineProfiles?: Array<{
    id: number
    name: string
    slug: string
    siteCount: number
    clickCount: number
    commissionSum: number | null
  }>
  keywordPresets?: Array<{
    id: number
    name: string
    slug: string
    siteCount: number
  }>
  unassignedPipeline?: { siteCount: number }
  meta?: { commissionsIncluded?: boolean; commissionsOmittedReason?: string; siteTotal?: number }
  error?: string
}

function StrategyAdoptionMetrics(props: {
  tenantId: string
  days: number
}): React.ReactElement {
  const { tenantId, days } = props
  const [data, setData] = useState<SummaryJson | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      qs.set('days', String(days))
      if (tenantId.trim()) qs.set('tenantId', tenantId.trim())
      const r = await fetch(`/api/admin/strategy/summary?${qs.toString()}`, { credentials: 'include' })
      const j = (await r.json().catch(() => ({}))) as SummaryJson
      if (!r.ok) {
        setData(null)
        setError(typeof j.error === 'string' ? j.error : r.statusText)
        return
      }
      setData(j)
    } catch (e) {
      setData(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [tenantId, days])

  useEffect(() => {
    void load()
  }, [load])

  const pairs = data?.strategyPairs ?? []
  const pipelines = data?.pipelineProfiles ?? []
  const presets = data?.keywordPresets ?? []
  const unassigned = data?.unassignedPipeline?.siteCount ?? 0
  const meta = data?.meta

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>策略采用与效果（本租户）</h2>
      <p style={{ opacity: 0.82, fontSize: '0.8125rem', marginBottom: '0.75rem', lineHeight: 1.5 }}>
        主表按每个站点的<strong>关键词排产预设 × 流水线方案</strong>组合汇总；站点数、点击与佣金均归因于该组合。点击数为「点击事件」在区间内的次数；佣金为区间内创建的记录合计（币种以各条为准）。
      </p>
      <div style={{ marginBottom: '0.65rem', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" disabled={loading} onClick={() => void load()}>
          {loading ? '加载中…' : '刷新指标'}
        </button>
        {data?.tenantId != null ? (
          <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>
            租户 {data.tenantId} · 近 {data.days ?? days} 天
            {meta?.siteTotal != null ? ` · 站点 ${meta.siteTotal} 个` : null}
          </span>
        ) : null}
      </div>
      {error ? (
        <div style={{ color: '#c62828', marginBottom: '0.75rem', fontSize: '0.875rem' }}>{error}</div>
      ) : null}

      <h3 style={{ fontSize: '0.9rem', marginBottom: '0.4rem' }}>策略组合（关键词预设 × 流水线）</h3>
      <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>组合说明</th>
              <th style={thStyle}>关键词预设</th>
              <th style={thStyle}>流水线方案</th>
              <th style={thStyle}>站点数</th>
              <th style={thStyle}>点击</th>
              <th style={thStyle}>佣金合计</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((row) => (
              <tr
                key={`${row.pipelineProfileId ?? 'n'}:${row.keywordBatchPresetId ?? 'n'}`}
              >
                <td style={tdStyle}>{row.label}</td>
                <td style={tdStyle}>
                  {row.keywordPresetName}
                  {row.keywordPresetSlug ? (
                    <>
                      {' '}
                      <code style={{ fontSize: '0.75rem' }}>{row.keywordPresetSlug}</code>
                    </>
                  ) : null}
                </td>
                <td style={tdStyle}>
                  {row.pipelineProfileName}
                  {row.pipelineProfileSlug ? (
                    <>
                      {' '}
                      <code style={{ fontSize: '0.75rem' }}>{row.pipelineProfileSlug}</code>
                    </>
                  ) : null}
                </td>
                <td style={tdStyle}>{row.siteCount}</td>
                <td style={tdStyle}>{row.clickCount}</td>
                <td style={tdStyle}>
                  {meta?.commissionsIncluded === false ? (
                    <span style={{ opacity: 0.75 }}>
                      —
                      {meta.commissionsOmittedReason === 'forbidden' ? '（无权限）' : ''}
                    </span>
                  ) : row.commissionSum != null ? (
                    row.commissionSum.toFixed(2)
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: '0.8125rem', opacity: 0.82, marginBottom: '0.65rem', lineHeight: 1.5 }}>
        单维度汇总已合并到上表；仍可按仅流水线或仅预设排查时，展开下方「单维度汇总（兼容）」或到集合页查看。
      </p>

      <details style={{ marginBottom: '0.75rem' }}>
        <summary style={{ cursor: 'pointer', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
          单维度汇总（兼容）
        </summary>

        <h4 style={{ fontSize: '0.85rem', marginBottom: '0.35rem', marginTop: '0.5rem' }}>
          流水线方案 · 站点 / 点击 / 佣金
        </h4>
        <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr>
                <th style={thStyle}>方案</th>
                <th style={thStyle}>Slug</th>
                <th style={thStyle}>站点数</th>
                <th style={thStyle}>点击</th>
                <th style={thStyle}>佣金合计</th>
              </tr>
            </thead>
            <tbody>
              {pipelines.map((row) => (
                <tr key={row.id}>
                  <td style={tdStyle}>{row.name}</td>
                  <td style={tdStyle}>
                    <code>{row.slug}</code>
                  </td>
                  <td style={tdStyle}>{row.siteCount}</td>
                  <td style={tdStyle}>{row.clickCount}</td>
                  <td style={tdStyle}>
                    {meta?.commissionsIncluded === false ? (
                      <span style={{ opacity: 0.75 }}>
                        —
                        {meta.commissionsOmittedReason === 'forbidden' ? '（无权限）' : ''}
                      </span>
                    ) : row.commissionSum != null ? (
                      row.commissionSum.toFixed(2)
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4 style={{ fontSize: '0.85rem', marginBottom: '0.35rem' }}>关键词排产预设 · 站点数</h4>
        <div style={{ overflowX: 'auto', marginBottom: '0.5rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr>
                <th style={thStyle}>预设</th>
                <th style={thStyle}>Slug</th>
                <th style={thStyle}>站点数</th>
              </tr>
            </thead>
            <tbody>
              {presets.map((row) => (
                <tr key={row.id}>
                  <td style={tdStyle}>{row.name}</td>
                  <td style={tdStyle}>
                    <code>{row.slug}</code>
                  </td>
                  <td style={tdStyle}>{row.siteCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p style={{ fontSize: '0.8125rem', opacity: 0.85, margin: 0 }}>
        未绑定流水线方案的站点：<strong>{unassigned}</strong> 个
      </p>
    </div>
  )
}

export function StrategyPanelView(_props: Record<string, unknown>): React.ReactElement {
  void _props
  const [tenantCtx, setTenantCtx] = useState('')
  const [kpiDays, setKpiDays] = useState(30)

  return (
    <Gutter>
      <h1 style={{ fontSize: '1.35rem', marginBottom: '0.75rem' }}>策略面板</h1>
      <p style={{ opacity: 0.82, marginBottom: '1.25rem', maxWidth: '44rem', lineHeight: 1.55 }}>
        聚合 SEO 流水线方案、全局默认、关键词排产预设与 KPI 对比。站点/文章级绑定仍在「站点」「文章」侧栏字段中编辑。
      </p>

      <div style={cardStyle}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.65rem' }}>快捷入口</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
          <Link href="/admin/collections/pipeline-profiles" prefetch={false} style={linkButtonStyle}>
            SEO 流水线方案
          </Link>
          <Link href="/admin/collections/keyword-batch-presets" prefetch={false} style={linkButtonStyle}>
            关键词排产预设
          </Link>
          <Link href="/admin/globals/pipeline-settings" prefetch={false} style={linkButtonStyle}>
            全局 SEO 流水线
          </Link>
          <Link href="/admin/pipeline-profiles/compare" prefetch={false} style={linkButtonStyle}>
            SEO 流水线方案 · KPI（含批量挂载）
          </Link>
        </div>
        <p style={{ opacity: 0.8, fontSize: '0.8125rem', marginTop: '0.75rem', marginBottom: 0, lineHeight: 1.5 }}>
          关键词列表「默认排产 / Quick-win」弹窗会按站点关联的排产预填参数；未在此处配置时仍用服务端默认。
        </p>
      </div>

      <div style={cardStyle}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.65rem' }}>租户与区间</h2>
        <p style={{ opacity: 0.8, fontSize: '0.8125rem', marginBottom: '0.65rem', lineHeight: 1.5 }}>
          全租户管理员须填写租户 ID；单租户账号可留空。以下「策略采用与效果」与「流水线与 KPI」共用同一组值。
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <label>
            <span style={{ display: 'block', fontSize: '0.75rem', marginBottom: 4 }}>租户 ID</span>
            <input
              value={tenantCtx}
              onChange={(e) => setTenantCtx(e.target.value)}
              style={{
                padding: '0.45rem 0.55rem',
                borderRadius: 4,
                border: '1px solid var(--theme-elevation-150)',
                width: 120,
              }}
            />
          </label>
          <label>
            <span style={{ display: 'block', fontSize: '0.75rem', marginBottom: 4 }}>天数</span>
            <input
              type="number"
              min={1}
              max={730}
              value={kpiDays}
              onChange={(e) => setKpiDays(Number(e.target.value) || 30)}
              style={{
                padding: '0.45rem 0.55rem',
                borderRadius: 4,
                border: '1px solid var(--theme-elevation-150)',
                width: 96,
              }}
            />
          </label>
        </div>
      </div>

      <StrategyAdoptionMetrics tenantId={tenantCtx} days={kpiDays} />

      <h2 style={{ fontSize: '1.05rem', marginBottom: '0.65rem' }}>流水线与 KPI</h2>
      <PipelineProfilesKpiCompareSection
        tenantId={tenantCtx}
        onTenantIdChange={setTenantCtx}
        days={kpiDays}
        onDaysChange={setKpiDays}
      />

      <div style={cardStyle}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.45rem' }}>批量挂载站点/文章</h2>
        <p style={{ opacity: 0.85, fontSize: '0.8125rem', margin: 0, lineHeight: 1.5 }}>
          批量分配与清空 <code>pipelineProfile</code> 仅在{' '}
          <Link href="/admin/pipeline-profiles/compare" prefetch={false} style={{ color: 'inherit' }}>
            KPI 完整页
          </Link>
          提供，避免与上方租户上下文重复操作。
        </p>
      </div>
    </Gutter>
  )
}
