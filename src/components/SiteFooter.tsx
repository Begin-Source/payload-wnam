'use client'

export function SiteFooter(): React.ReactElement {
  return (
    <footer style={{ padding: '2rem 1rem', borderTop: '1px solid #e2e8f0' }}>
      <p style={{ margin: 0, fontSize: '0.875rem' }}>© {new Date().getFullYear()}</p>
    </footer>
  )
}
