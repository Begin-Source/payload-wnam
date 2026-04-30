'use client'

import { Button } from '@payloadcms/ui'
import { usePathname, useRouter } from 'next/navigation'
import React, { useCallback, useState } from 'react'

const fieldWrap: React.CSSProperties = {
  marginBottom: '1rem',
}

const hint: React.CSSProperties = {
  fontSize: '0.75rem',
  opacity: 0.8,
  marginTop: '0.35rem',
}

/**
 * Edit view: generate Review MDX for the current offer (parses id from admin URL).
 */
export function OfferReviewMdxGenerateField(): React.ReactElement {
  const pathname = usePathname()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const offerId = (() => {
    const m = pathname.match(/\/admin\/collections\/offers\/(\d+)/)
    return m ? Number(m[1]) : NaN
  })()

  const run = useCallback(async () => {
    if (!Number.isFinite(offerId) || offerId < 1) {
      setMessage('Save the document first to get an offer id.')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/offers/generate-review-mdx', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerIds: [offerId],
          createArticle: true,
          locale: 'en',
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        results?: { offerId: number; ok: boolean; error?: string; articleId?: number }[]
      }
      if (!res.ok) {
        setMessage(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
        return
      }
      const r0 = Array.isArray(data.results) ? data.results[0] : undefined
      if (!r0?.ok) {
        setMessage(typeof r0?.error === 'string' ? r0.error : 'Generation failed')
        return
      }
      setMessage(
        r0.articleId != null ? `Done. Article id: ${r0.articleId}. Refresh to load new MDX.` : 'Done. Refresh to load new MDX.',
      )
      router.refresh()
    } catch {
      setMessage('Network error')
    } finally {
      setBusy(false)
    }
  }, [offerId, router])

  return (
    <div style={fieldWrap}>
      <Button
        type="button"
        buttonStyle="secondary"
        size="small"
        disabled={busy || !Number.isFinite(offerId)}
        onClick={() => void run()}
      >
        {busy ? 'Generating…' : 'Generate Review MDX + Article'}
      </Button>
      <p style={hint}>
        Calls OpenRouter, writes review MDX here, and creates/updates a draft <code>articles</code> row
        (Lexical body). Requires linked site on this offer.
      </p>
      {message ? (
        <p style={{ ...hint, color: 'var(--theme-warning-500, #b45309)' }}>{message}</p>
      ) : null}
    </div>
  )
}
