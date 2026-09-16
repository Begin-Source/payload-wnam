'use client'
import { Button } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { showEphemeralAdminToast } from '@/utilities/adminEphemeralToast'
import { BlueprintPickerOption, formatBlueprintLine, backdropStyle, panelStyle, fieldLabel, inputStyle, amzDesignTitleId } from './model'
export function AmzTemplateDesignQuickActionModal(): React.ReactElement {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [bpQuery, setBpQuery] = useState('')
  const [blueprints, setBlueprints] = useState<BlueprintPickerOption[]>([])
  const [blueprintsLoading, setBlueprintsLoading] = useState(false)
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<number | null>(null)
  const [selectedBlueprintLabel, setSelectedBlueprintLabel] = useState('')
  const [bpMenuOpen, setBpMenuOpen] = useState(false)
  const bpComboboxRef = useRef<HTMLDivElement>(null)
  const skipBpQueryDebounceRef = useRef(false)

  const [mainProduct, setMainProduct] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [fillSlots, setFillSlots] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadBlueprints = useCallback(async (q: string) => {
    setBlueprintsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/admin/site-blueprints/options?${params}`, {
        credentials: 'include',
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: unknown }
        throw new Error(typeof err.error === 'string' ? err.error : '加载设计列表失败')
      }
      const data = (await res.json()) as { blueprints: BlueprintPickerOption[] }
      setBlueprints(data.blueprints ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载设计列表失败')
      setBlueprints([])
    } finally {
      setBlueprintsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open || !bpMenuOpen) return
    if (skipBpQueryDebounceRef.current) {
      skipBpQueryDebounceRef.current = false
      return
    }
    const t = window.setTimeout(() => {
      void loadBlueprints(bpQuery)
    }, 300)
    return () => window.clearTimeout(t)
  }, [open, bpMenuOpen, bpQuery, loadBlueprints])

  useEffect(() => {
    if (!bpMenuOpen) return
    const onDocMouseDown = (e: MouseEvent): void => {
      const root = bpComboboxRef.current
      if (root && !root.contains(e.target as Node)) {
        setBpMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [bpMenuOpen])

  useEffect(() => {
    if (!bpMenuOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setBpMenuOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [bpMenuOpen])

  const close = (): void => {
    setOpen(false)
    setBpQuery('')
    setBlueprints([])
    setSelectedBlueprintId(null)
    setSelectedBlueprintLabel('')
    setBpMenuOpen(false)
    setMainProduct('')
    setAiModel('')
    setFillSlots(false)
    setError(null)
  }

  const pickBlueprint = (b: BlueprintPickerOption): void => {
    setSelectedBlueprintId(b.id)
    setSelectedBlueprintLabel(formatBlueprintLine(b))
    setMainProduct(String(b.site?.mainProduct ?? '').trim())
    setBpQuery('')
    setBpMenuOpen(false)
  }

  const clearBlueprintSelection = (): void => {
    setSelectedBlueprintId(null)
    setSelectedBlueprintLabel('')
    setMainProduct('')
    setBpQuery('')
    void loadBlueprints('')
  }

  const submit = async (): Promise<void> => {
    if (selectedBlueprintId == null) {
      setError('请选择设计')
      return
    }
    const mainTrim = mainProduct.trim()
    if (!mainTrim) {
      setError('请填写主产品（或与关联站点已保存的主品一致）')
      return
    }
    setError(null)

    const blueprintId = selectedBlueprintId
    const aiModelTrim = aiModel.trim()
    const baseBody = {
      blueprintId,
      mainProduct: mainTrim,
      fillSlots,
      ...(aiModelTrim ? { aiModel: aiModelTrim } : {}),
    }

    try {
      const prepRes = await fetch('/api/admin/site-blueprints/generate-amz-template-design', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...baseBody, prepare: true }),
      })
      const prepData = (await prepRes.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
      }
      if (!prepRes.ok || prepData.ok !== true) {
        setError(
          typeof prepData.error === 'string'
            ? prepData.error
            : `请求失败（HTTP ${prepRes.status}）`,
        )
        return
      }
    } catch {
      setError('网络错误，请稍后重试')
      return
    }

    close()

    if (
      typeof window !== 'undefined' &&
      window.location.pathname.includes('/collections/site-blueprints')
    ) {
      router.refresh()
    }

    void (async () => {
      try {
        const res = await fetch('/api/admin/site-blueprints/generate-amz-template-design', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...baseBody, afterPrepare: true }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
          code?: string
        }
        if (!res.ok || data.ok !== true) {
          const errText =
            typeof data.error === 'string' ? data.error : `请求失败（HTTP ${res.status}）`
          const code = typeof data.code === 'string' && data.code.trim() ? data.code.trim() : ''
          showEphemeralAdminToast(
            'error',
            'AMZ 设计失败（后台）',
            code ? `${code}: ${errText}` : errText,
          )
        }
      } catch (e) {
        showEphemeralAdminToast(
          'error',
          'AMZ 设计失败（后台）',
          e instanceof Error ? e.message : '网络错误',
        )
      } finally {
        if (
          typeof window !== 'undefined' &&
          window.location.pathname.includes('/collections/site-blueprints')
        ) {
          router.refresh()
        }
      }
    })()
  }

  return (
    <>
      <Button buttonStyle="secondary" onClick={() => setOpen(true)} size="small" type="button">
        快捷操作 · 生成 AMZ 设计
      </Button>

      {open ? (
        <div aria-labelledby={amzDesignTitleId} aria-modal role="dialog" style={backdropStyle}>
          <button
            aria-label="关闭"
            style={{
              position: 'absolute',
              inset: 0,
              border: 'none',
              padding: 0,
              margin: 0,
              cursor: 'default',
              background: 'transparent',
            }}
            type="button"
            onClick={close}
          />
          <div style={{ ...panelStyle, position: 'relative', zIndex: 1 }}>
            <h2
              id={amzDesignTitleId}
              style={{ margin: '0 0 0.75rem', fontSize: '1.125rem', fontWeight: 600 }}
            >
              快捷操作 · 生成 AMZ 设计
            </h2>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', opacity: 0.85, lineHeight: 1.5 }}>
              对齐 n8n「Generate Template Design」：用 OpenRouter 根据主产品与 niche 改写所选「设计」的{' '}
              <strong>amzSiteConfigJson</strong>。前置：该「设计」已选定「站点」，且对应站点的「站点布局」为{' '}
              <strong>amz-template-1</strong> 或 <strong>amz-template-2</strong>
              。导航主菜单、页脚固定链接与首页分类项会在服务端保持与合并前一致。需配置
              OPENROUTER_API_KEY 或 OPENAI_API_KEY。
              <strong style={{ display: 'block', marginTop: '0.5rem', fontWeight: 600 }}>
                点击「生成并写回设计」后先标为「运行中」并关闭弹窗，列表会马上刷新；生成结束后若仍在本列表页会再刷新一次以显示「已完成」或「错误」。进度请在表格「设计流程状态」列查看。
              </strong>
            </p>

            {error ? (
              <p style={{ color: 'var(--theme-error-500)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
                {error}
              </p>
            ) : null}

            <div ref={bpComboboxRef} style={{ marginBottom: '1rem', position: 'relative' }}>
              <span style={fieldLabel} id="amz-design-bp-label">
                设计
              </span>
              <button
                aria-expanded={bpMenuOpen}
                aria-haspopup="listbox"
                aria-labelledby="amz-design-bp-label"
                style={{
                  ...inputStyle,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  width: '100%',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                type="button"
                onClick={() => {
                  setBpMenuOpen((prev) => {
                    const next = !prev
                    if (next) {
                      skipBpQueryDebounceRef.current = true
                      void loadBlueprints(bpQuery)
                    }
                    return next
                  })
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    opacity: selectedBlueprintId == null ? 0.55 : 1,
                  }}
                >
                  {selectedBlueprintId == null ? '请选择设计' : selectedBlueprintLabel}
                </span>
                <span aria-hidden style={{ flexShrink: 0, opacity: 0.65, fontSize: '0.65rem' }}>
                  {bpMenuOpen ? '▲' : '▼'}
                </span>
              </button>

              {bpMenuOpen ? (
                <div
                  role="listbox"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: '100%',
                    marginTop: 4,
                    zIndex: 5,
                    borderRadius: 6,
                    border: '1px solid var(--theme-elevation-150)',
                    background: 'var(--theme-elevation-50)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                    padding: '0.5rem',
                    maxHeight: 280,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  <input
                    aria-label="筛选设计"
                    autoComplete="off"
                    placeholder="输入设计名称或 slug 筛选…"
                    style={inputStyle}
                    type="search"
                    value={bpQuery}
                    onChange={(e) => setBpQuery(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div style={{ maxHeight: 200, overflow: 'auto', margin: '0 -0.25rem' }}>
                    <button
                      aria-selected={false}
                      role="option"
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.45rem 0.5rem',
                        border: 'none',
                        borderRadius: 4,
                        background: 'transparent',
                        color: 'inherit',
                        cursor: 'pointer',
                        fontSize: '0.8125rem',
                        opacity: 0.9,
                      }}
                      type="button"
                      onClick={() => clearBlueprintSelection()}
                    >
                      清空选择
                    </button>
                    {blueprintsLoading ? (
                      <span style={{ fontSize: '0.75rem', opacity: 0.7, padding: '0.25rem 0.5rem' }}>
                        加载中…
                      </span>
                    ) : (
                      blueprints.map((b) => (
                        <button
                          key={b.id}
                          aria-selected={selectedBlueprintId === b.id}
                          role="option"
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '0.45rem 0.5rem',
                            border: 'none',
                            borderRadius: 4,
                            background:
                              selectedBlueprintId === b.id
                                ? 'var(--theme-elevation-100)'
                                : 'transparent',
                            color: 'inherit',
                            cursor: 'pointer',
                            fontSize: '0.8125rem',
                            opacity: b.site ? 1 : 0.55,
                          }}
                          type="button"
                          onClick={() => pickBlueprint(b)}
                        >
                          {formatBlueprintLine(b)}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'flex-start',
                  cursor: 'pointer',
                  fontSize: '0.8125rem',
                  lineHeight: 1.45,
                }}
              >
                <input
                  checked={fillSlots}
                  style={{ marginTop: 2 }}
                  type="checkbox"
                  onChange={(e) => setFillSlots(e.target.checked)}
                />
                <span>
                  <strong>填空刷新（白名单：英文文案 + 可选主题色 / 字体）</strong>
                  ：不把整份 siteConfig 发给模型，只覆盖白名单字段（含 oklch 主题令牌与 fonts.sans / fonts.mono 等）；导航、分类条目、法务链接等锁区仍由服务端保持不变。
                </span>
              </label>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <span style={fieldLabel}>主产品</span>
              <textarea
                placeholder="参与 AI 提示词；若与站点字段不同，提交后会写回站点的「主品 / Main product」。"
                rows={2}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
                value={mainProduct}
                onChange={(e) => setMainProduct(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <span style={fieldLabel}>OpenRouter 模型（可选）</span>
              <input
                placeholder="留空则 google/gemini-2.5-flash"
                style={inputStyle}
                type="text"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <Button buttonStyle="secondary" onClick={close} type="button">
                关闭
              </Button>
              <Button
                type="button"
                disabled={selectedBlueprintId == null}
                onClick={() => {
                  void submit()
                }}
              >
                生成并写回设计
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
