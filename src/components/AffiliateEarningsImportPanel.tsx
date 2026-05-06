'use client'

import { Button, PopupList } from '@payloadcms/ui'
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import {
  getCsvPanelOpen,
  setCsvPanelOpen,
  subscribeCsvPanelOpen,
} from '@/components/csvPanelOpenStore'

type TenantOption = { id: number; name: string; slug: string }

const DEFAULT_COLLECTION_SLUG = 'affiliate-earnings-imports'

const API_IMPORT_OPTIONS = '/api/admin/affiliate-earnings-imports/import-options'
const API_CSV_IMPORT = '/api/admin/affiliate-earnings-imports/csv-import'

export type AffiliateEarningsImportSlotProps = {
  collectionSlug?: string
}

function resolveSlug(collectionSlug: string | undefined): string {
  return collectionSlug?.trim() || DEFAULT_COLLECTION_SLUG
}

/**
 * 列表三点菜单：展开/收起 Amazon 报表导入面板（与文章等 CSV 面板一致）。
 */
export function AffiliateEarningsImportListMenuItem(
  props: AffiliateEarningsImportSlotProps,
): React.ReactElement {
  const slug = resolveSlug(props.collectionSlug)
  const open = useSyncExternalStore(
    (onChange) => subscribeCsvPanelOpen(slug, onChange),
    () => getCsvPanelOpen(slug),
    () => false,
  )
  return (
    <PopupList.Button
      id={`affiliate-earnings-import-panel-menu-${slug}`}
      onClick={() => setCsvPanelOpen(slug, !open)}
    >
      {open ? '关闭 Amazon 报表导入' : 'Amazon 报表导入'}
    </PopupList.Button>
  )
}

/** Amazon Associates CSV / TSV 导入面板（列表搜索栏下方；默认收起）。 */
export function AffiliateEarningsImportPanel(props: AffiliateEarningsImportSlotProps): React.ReactElement | null {
  const slug = resolveSlug(props.collectionSlug)

  const expanded = useSyncExternalStore(
    (onChange) => subscribeCsvPanelOpen(slug, onChange),
    () => getCsvPanelOpen(slug),
    () => false,
  )

  const closePanel = useCallback(() => setCsvPanelOpen(slug, false), [slug])

  const fileRef = useRef<HTMLInputElement>(null)

  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [tenantId, setTenantId] = useState<string>('')
  const [replaceSamePeriod, setReplaceSamePeriod] = useState(true)
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [tenantChoiceRequired, setTenantChoiceRequired] = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true)
    try {
      const res = await fetch(API_IMPORT_OPTIONS, { credentials: 'include' })
      if (!res.ok) {
        setTenants([])
        setTenantChoiceRequired(false)
        return
      }
      const data = (await res.json()) as {
        tenants?: TenantOption[]
        tenantChoiceRequired?: boolean
      }
      const list = data.tenants ?? []
      setTenants(list)
      setTenantChoiceRequired(Boolean(data.tenantChoiceRequired))
      if (list.length === 1 && !data.tenantChoiceRequired) {
        setTenantId(String(list[0]!.id))
      }
    } catch {
      setTenants([])
    } finally {
      setLoadingOptions(false)
    }
  }, [])

  useEffect(() => {
    if (!expanded) return
    void loadOptions()
  }, [expanded, loadOptions])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    const fileEl = fileRef.current
    const file = fileEl?.files?.[0]
    if (!file) {
      setMessage({ kind: 'err', text: '请选择文件。' })
      return
    }
    if (!periodStart.trim() || !periodEnd.trim()) {
      setMessage({ kind: 'err', text: '请填写结算区间（开始 / 结束日期）。' })
      return
    }
    if (tenantChoiceRequired && !tenantId.trim()) {
      setMessage({ kind: 'err', text: '请选择租户。' })
      return
    }

    const fd = new FormData()
    fd.append('file', file)
    fd.append('periodStart', periodStart.trim())
    fd.append('periodEnd', periodEnd.trim())
    fd.append('replaceSamePeriod', replaceSamePeriod ? 'true' : 'false')
    if (tenantId.trim()) {
      fd.append('tenantId', tenantId.trim())
    }

    setSubmitting(true)
    try {
      const res = await fetch(API_CSV_IMPORT, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        const errs = data.errors as string[] | undefined
        const errText =
          Array.isArray(errs) && errs.length > 0
            ? errs.join('\n')
            : typeof data.error === 'string'
              ? data.error
              : `导入失败（${String(res.status)}）`
        setMessage({ kind: 'err', text: errText })
        return
      }
      const rowsImported = data.rowsImported as number | undefined
      const gross = data.grossEarningsUsd as number | undefined
      const unmatched = data.unmatchedTrackingRows as number | undefined
      const deleted = data.deletedImports as number | undefined
      setMessage({
        kind: 'ok',
        text: `导入成功：${rowsImported ?? 0} 行，Total Earnings 合计约 ${typeof gross === 'number' ? gross.toFixed(2) : '?'} USD。覆盖删除批次 ${deleted ?? 0}；未匹配 Tracking→员工的行数 ${unmatched ?? 0}。`,
      })
      if (fileEl) fileEl.value = ''
      window.dispatchEvent(new CustomEvent('payload:listRefresh'))
    } catch {
      setMessage({ kind: 'err', text: '网络错误，请重试。' })
    } finally {
      setSubmitting(false)
    }
  }

  if (!expanded) {
    return null
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div
        style={{
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: 8,
          padding: '0.75rem 1rem',
          background: 'var(--theme-elevation-50)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '0.65rem',
            gap: '0.5rem',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Amazon Associates 报表导入</span>
          <Button buttonStyle="transparent" onClick={closePanel} size="small" type="button">
            关闭 Amazon 报表导入
          </Button>
        </div>

        <p style={{ margin: '0 0 0.65rem', opacity: 0.9, fontSize: '0.8125rem' }}>
          支持逗号 CSV 或 Tab 分隔导出文件。列名需含 Tracking Id、Clicks、Items Ordered 等与亚马逊后台一致。同一租户、同一结算区间勾选「覆盖已有导入」时会先删除旧导入再写入。
        </p>

        {loadingOptions ? (
          <p style={{ margin: 0, fontSize: '0.875rem' }}>加载租户选项…</p>
        ) : (
          <form onSubmit={onSubmit}>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                gap: '1rem',
                width: '100%',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'flex-end',
                  gap: '0.625rem',
                  flex: '1 1 auto',
                  minWidth: 0,
                }}
              >
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '0.8125rem',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ whiteSpace: 'nowrap', lineHeight: 1 }}>区间开始</span>
                  <input
                    type="date"
                    required
                    value={periodStart}
                    onChange={(ev) => setPeriodStart(ev.target.value)}
                    style={{ margin: 0, verticalAlign: 'middle' }}
                  />
                </label>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '0.8125rem',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ whiteSpace: 'nowrap', lineHeight: 1 }}>区间结束</span>
                  <input
                    type="date"
                    required
                    value={periodEnd}
                    onChange={(ev) => setPeriodEnd(ev.target.value)}
                    style={{ margin: 0, verticalAlign: 'middle' }}
                  />
                </label>
                {tenantChoiceRequired && tenants.length > 0 ? (
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: '0.8125rem',
                      flexShrink: 0,
                      minWidth: 120,
                    }}
                  >
                    <span style={{ whiteSpace: 'nowrap', lineHeight: 1 }}>租户</span>
                    <select
                      value={tenantId}
                      required
                      onChange={(ev) => setTenantId(ev.target.value)}
                      style={{ margin: 0 }}
                    >
                      <option value="">请选择</option>
                      {tenants.map((t) => (
                        <option key={t.id} value={String(t.id)}>
                          {t.name || t.slug || `#${t.id}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              <input
                ref={fileRef}
                accept=".csv,.txt,text/csv,text/plain"
                style={{ display: 'none' }}
                type="file"
              />

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  flexWrap: 'nowrap',
                  alignItems: 'flex-end',
                  gap: '0.75rem',
                  flexShrink: 0,
                  marginLeft: 'auto',
                  justifyContent: 'flex-end',
                }}
              >
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.8125rem',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    lineHeight: 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={replaceSamePeriod}
                    onChange={(ev) => setReplaceSamePeriod(ev.target.checked)}
                  />
                  覆盖已有导入
                </label>

                <Button
                  buttonStyle="secondary"
                  onClick={() => fileRef.current?.click()}
                  size="small"
                  type="button"
                  style={{ flexShrink: 0 }}
                >
                  选择文件…
                </Button>
                <Button type="submit" disabled={submitting} style={{ flexShrink: 0 }}>
                  {submitting ? '导入中…' : '导入'}
                </Button>
              </div>
            </div>
          </form>
        )}
        {message ? (
          <pre
            style={{
              marginTop: '0.65rem',
              marginBottom: 0,
              whiteSpace: 'pre-wrap',
              fontSize: '0.8125rem',
              color: message.kind === 'ok' ? 'var(--theme-success-600)' : 'var(--theme-error-600)',
            }}
          >
            {message.text}
          </pre>
        ) : null}
      </div>
    </div>
  )
}
