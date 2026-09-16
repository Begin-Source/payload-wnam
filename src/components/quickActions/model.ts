
import React from 'react'
import type { WorkflowQuickKind } from '@/utilities/workflowQuickCreate'
export type SiteOption = {
  id: number
  name: string
  slug: string
  primaryDomain: string
  /** 站点上的主产品；域名快捷操作用于预填 */
  mainProduct?: string | null
  siteLayout?: string | null
}

export type CategoryOption = {
  id: number
  name: string
  slug: string
  description: string | null
}

export function formatSiteLine(s: SiteOption): string {
  return `${s.name} (${s.slug}) ${s.primaryDomain}`
}

export type BlueprintPickerOption = {
  id: number
  name: string
  slug: string
  mirroredSiteLayout: string | null
  site: SiteOption | null
}

export function formatBlueprintLine(b: BlueprintPickerOption): string {
  const layout = b.mirroredSiteLayout ?? '—'
  if (!b.site) {
    return `${b.name}（${b.slug}）· 未关联站点 · 布局：${layout}`
  }
  return `${b.name}（${b.slug}）· ${b.site.name}（${b.site.slug}）· 布局：${layout}`
}

export const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
  background: 'rgba(0, 0, 0, 0.45)',
}

export const panelStyle: React.CSSProperties = {
  width: 'min(32rem, 100%)',
  maxHeight: '90vh',
  overflow: 'auto',
  borderRadius: 8,
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-0)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  padding: '1.25rem 1.5rem',
}

export const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 600,
  marginBottom: '0.35rem',
  opacity: 0.85,
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.65rem',
  borderRadius: 4,
  border: '1px solid var(--theme-elevation-150)',
  background: 'var(--theme-elevation-50)',
  color: 'inherit',
  fontSize: '0.875rem',
}

export const workflowQuickWarnBoxStyle: React.CSSProperties = {
  marginBottom: '1rem',
  padding: '0.65rem 0.75rem',
  borderRadius: 6,
  border: '1px solid var(--theme-warning-500, #b45309)',
  background: 'var(--theme-warning-50, rgba(250, 204, 21, 0.12))',
  fontSize: '0.8125rem',
  lineHeight: 1.5,
}

export const UI: Record<
  WorkflowQuickKind,
  {
    buttonText: string
    title: string
    description: string
    topicLabel: string
    topicPlaceholder: string
    submitLabel: string
    showCategories: boolean
  }
> = {
  articles: {
    buttonText: '快捷操作 · 内容大纲',
    title: '快捷操作 · 内容大纲',
    description: '选定站点与可选分类后，发起「生成文章」工作流；主题会与分类说明合并传给后端。',
    topicLabel: '文章主题 / 要点（可选）',
    topicPlaceholder: '留空则由系统选题',
    submitLabel: '写文章（生成文章工作流）',
    showCategories: true,
  },
  pages: {
    buttonText: '快捷操作 · 页面',
    title: '快捷操作 · 页面',
    description: '选定站点与可选分类后，发起「生成页面」工作流；主题会与分类说明合并传给后端。',
    topicLabel: '页面主题 / 要点（可选）',
    topicPlaceholder: '留空则由系统选题',
    submitLabel: '生成页面（工作流）',
    showCategories: true,
  },
  categories: {
    buttonText: '快捷操作 · 分类',
    title: '快捷操作 · 分类',
    description: '选定站点与可选分类后，发起与分类相关的工作流；要点会与分类说明合并传给后端。',
    topicLabel: '说明 / 要点（可选）',
    topicPlaceholder: '留空则由系统根据上下文处理',
    submitLabel: '发起分类工作流',
    showCategories: true,
  },
  keywords: {
    buttonText: '快捷操作 · 关键词',
    title: '快捷操作 · 关键词',
    description: '选定站点后，发起关键词相关的工作流；可填写种子词或要点。',
    topicLabel: '要点 / 种子词（可选）',
    topicPlaceholder: '留空则由系统拓展',
    submitLabel: '发起关键词工作流',
    showCategories: false,
  },
  'site-blueprints': {
    buttonText: '快捷操作 · 设计工作流',
    title: '快捷操作 · 设计工作流',
    description:
      '选定站点与可选分类后，创建 workflow-jobs 排产任务；要点会与分类说明合并传给后端。',
    topicLabel: '设计说明 / 要点（可选）',
    topicPlaceholder: '留空则由系统根据上下文处理',
    submitLabel: '发起设计工作流',
    showCategories: true,
  },
  media: {
    buttonText: '快捷操作 · 媒体库',
    title: '快捷操作 · 媒体库',
    description: '选定站点后，发起与媒体处理相关的工作流；可填写要点或说明。',
    topicLabel: '要点 / 说明（可选）',
    topicPlaceholder: '留空则由系统处理',
    submitLabel: '发起媒体工作流',
    showCategories: false,
  },
}

export type ArticleQuickMode = 'single' | 'batch'

export const amzDesignTitleId = 'quick-action-title-amz-design'
