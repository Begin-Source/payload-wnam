'use client'

export function MainNav(_props: { links?: { label: string; href: string }[] }): React.ReactElement {
  return (
    <nav aria-label="Main">
      <ul style={{ display: 'flex', gap: '1rem', listStyle: 'none', padding: 0 }} />
    </nav>
  )
}
