import type { Metadata } from 'next'
import React from 'react'

import './portal-shell.css'

export const metadata: Metadata = {
  title: '知识库 · 阅读',
  description: '登录后阅读已发布的知识库与操作手册',
}

/**
 * 为 /portal/* 提供合法文档根（html / body），
 * 与 (welcome)、(payload)、[locale] 的独立文档层方式一致，避免与全局叠套。
 */
export default function PortalShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="portalShellBody">
        {children}
      </body>
    </html>
  )
}
