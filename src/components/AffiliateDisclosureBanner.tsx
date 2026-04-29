'use client'

export function AffiliateDisclosureBanner(): React.ReactElement {
  return (
    <aside className="affiliate-disclosure-banner" style={{ padding: '0.75rem', background: '#f8fafc' }}>
      <p style={{ margin: 0, fontSize: '0.875rem' }}>
        Disclosure: This site may earn commissions from qualifying purchases (e.g. Amazon Associates).
      </p>
    </aside>
  )
}
