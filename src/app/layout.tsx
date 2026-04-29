import React from 'react'

/**
 * 透传子布局，让各 route group（(welcome)、(payload)、[locale]、(portal)）各自提供完整文档层，
 * 避免与 Payload `RootLayout` 的 <html>/<body> 叠套。
 * Portal 的文档层见 `(portal)/layout.tsx`。
 */
export default function AppRootLayout({ children }: { children: React.ReactNode }) {
  return children
}
