import type { Metadata } from 'next'
import React from 'react'

import './welcome.css'

export const metadata: Metadata = {
  title: '云系统 · 基源科技',
  description: '基源科技云系统入口',
}

export default function WelcomeRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          color: '#e8e8ec',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
          backgroundColor: '#070709',
          backgroundImage:
            'radial-gradient(ellipse 120% 80% at 50% -20%, rgba(59, 130, 246, 0.18), transparent 55%), radial-gradient(ellipse 80% 50% at 100% 100%, rgba(99, 102, 241, 0.12), transparent 50%)',
        }}
      >
        {children}
      </body>
    </html>
  )
}
