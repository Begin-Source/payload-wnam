import Link from 'next/link'
import React from 'react'

type NavItem = { href: string; label: string }

const navItems: NavItem[] = [
  { href: '/admin', label: '管理后台' },
  { href: '/portal/knowledge', label: '知识库阅读' },
  { href: '/admin/collections/knowledge-base', label: '知识库（管理）' },
]

/** Static system entry at `/` — not tied to `landing-templates` or site theme. */
export default function WelcomePage() {
  return (
    <main className="welcomeShell">
      <div className="welcomeCard">
        <header className="welcomeHero">
          <p className="welcomeCompany">基源科技</p>
          <h1 className="welcomeSystem">云系统</h1>
        </header>
        <p className="welcomeTagline">请选择下方入口进入相应模块。</p>
        <nav className="welcomeActions" aria-label="快捷入口">
          {navItems.map(({ href, label }) => (
            <Link key={href} href={href} className="welcomeBtn">
              {label}
            </Link>
          ))}
        </nav>
        <p className="welcomeFooter">© 2026 基源科技</p>
      </div>
    </main>
  )
}
