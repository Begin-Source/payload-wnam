'use client'

import { Button } from '@payloadcms/ui'
import React, { useEffect, useRef, useState } from 'react'

export type KeywordListDrawerOpeners = {
  quickWin: () => void
  defaultBatch: () => void
  highCommission: () => void
  comparisonDecision: () => void
  geo: () => void
  pillar: () => void
  seasonal: () => void
  refreshDecay: () => void
  syncDfs: () => void
}

const menuPanelStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: 4,
  minWidth: 220,
  maxWidth: 320,
  borderRadius: 6,
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-0)',
  boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
  padding: '0.35rem',
  zIndex: 30,
}

const menuItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '0.5rem 0.6rem',
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: '0.8125rem',
  lineHeight: 1.35,
}

const menuSectionLabelStyle: React.CSSProperties = {
  fontSize: '0.65rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  opacity: 0.55,
  padding: '0.35rem 0.5rem 0.2rem',
  textTransform: 'uppercase',
}

type MenuKey = 'brief' | 'topic' | 'data'

function MenuSection(props: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={menuSectionLabelStyle}>{props.label}</div>
      {props.children}
    </div>
  )
}

/**
 * Grouped dropdown triggers for keyword list drawers (replaces a row of separate secondary buttons).
 */
export function KeywordListGroupedToolbar(props: { openers: KeywordListDrawerOpeners }): React.ReactElement {
  const { openers } = props
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (openMenu == null) return
    const onDoc = (e: MouseEvent): void => {
      const el = wrapRef.current
      if (el && !el.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [openMenu])

  const run = (fn: () => void): void => {
    fn()
    setOpenMenu(null)
  }

  const toggle = (key: MenuKey): void => {
    setOpenMenu((m) => (m === key ? null : key))
  }

  return (
    <div
      ref={wrapRef}
      style={{
        display: 'inline-flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <div style={{ position: 'relative' }}>
        <Button buttonStyle="secondary" onClick={() => toggle('brief')} size="small" type="button">
          Brief 排产 ▾
        </Button>
        {openMenu === 'brief' ? (
          <div role="menu" style={menuPanelStyle}>
            <MenuSection label="Brief 排产">
              <button type="button" role="menuitem" style={menuItemStyle} onClick={() => run(openers.quickWin)}>
                精选 Quick-win 入队 · Brief
              </button>
              <button type="button" role="menuitem" style={menuItemStyle} onClick={() => run(openers.defaultBatch)}>
                默认排产 · Brief
              </button>
              <button type="button" role="menuitem" style={menuItemStyle} onClick={() => run(openers.highCommission)}>
                高价值类目词 · Brief
              </button>
              <button type="button" role="menuitem" style={menuItemStyle} onClick={() => run(openers.comparisonDecision)}>
                对比决策词 · Brief
              </button>
              <button type="button" role="menuitem" style={menuItemStyle} onClick={() => run(openers.geo)}>
                GEO / AI 引用向 · Brief
              </button>
            </MenuSection>
          </div>
        ) : null}
      </div>

      <div style={{ position: 'relative' }}>
        <Button buttonStyle="secondary" onClick={() => toggle('topic')} size="small" type="button">
          专题与刷新 ▾
        </Button>
        {openMenu === 'topic' ? (
          <div role="menu" style={menuPanelStyle}>
            <MenuSection label="集群与内容周期">
              <button type="button" role="menuitem" style={menuItemStyle} onClick={() => run(openers.pillar)}>
                Pillar 簇冲刺 · Brief
              </button>
              <button type="button" role="menuitem" style={menuItemStyle} onClick={() => run(openers.seasonal)}>
                季节 / 趋势向 · Brief
              </button>
              <button type="button" role="menuitem" style={menuItemStyle} onClick={() => run(openers.refreshDecay)}>
                排名衰减刷新 · Brief
              </button>
            </MenuSection>
          </div>
        ) : null}
      </div>

      <div style={{ position: 'relative' }}>
        <Button buttonStyle="secondary" onClick={() => toggle('data')} size="small" type="button">
          数据与同步 ▾
        </Button>
        {openMenu === 'data' ? (
          <div role="menu" style={menuPanelStyle}>
            <MenuSection label="DataForSEO">
              <button type="button" role="menuitem" style={menuItemStyle} onClick={() => run(openers.syncDfs)}>
                同步拉取 · DFS
              </button>
            </MenuSection>
          </div>
        ) : null}
      </div>
    </div>
  )
}
