/**
 * D1/sqlite TEXT json columns occasionally hold non-JSON strings (legacy writes, partial fragments),
 * which surfaces as Server SyntaxError during admin SSR: `Unexpected token … is not valid JSON`.
 *
 * Hydration mismatches caused by browser extensions (e.g. `data-*` on `<body>`) are unrelated.
 */
import type { CollectionAfterReadHook } from 'payload'

function looseJsonFromStored(value: unknown): unknown | null {
  if (value == null) return value
  if (typeof value === 'object') return value // already deserialized
  if (typeof value !== 'string') return value
  const t = value.trim()
  if (!t) return null
  const first = t[0]
  if (first !== '{' && first !== '[') {
    return null
  }
  try {
    return JSON.parse(t) as unknown
  } catch {
    return null
  }
}

/** Offers: `amazon.merchantRaw` / `amazon.dfsSnapshot` (json columns). slotLastPayload is textarea — leave as string. */
export const sanitizeOffersMerchantJsonFields: CollectionAfterReadHook = ({ doc }) => {
  if (!doc || typeof doc !== 'object') return doc
  const d = doc as Record<string, unknown>
  const amz = d.amazon
  if (amz && typeof amz === 'object') {
    const a = amz as Record<string, unknown>
    if ('merchantRaw' in a && a.merchantRaw != null) {
      const v = looseJsonFromStored(a.merchantRaw)
      a.merchantRaw = v ?? null
    }
    if ('dfsSnapshot' in a && a.dfsSnapshot != null) {
      const v = looseJsonFromStored(a.dfsSnapshot)
      a.dfsSnapshot = v ?? null
    }
  }
  return doc
}

/** Parse textarea JSON summary or legacy object for API routes before merge. */
export function parseStoredSummaryRecord(raw: unknown): Record<string, unknown> {
  if (!raw || raw === null) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t) return {}
    const v = looseJsonFromStored(raw)
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
    return {}
  }
  return {}
}

export function stringifySummaryRecord(obj: Record<string, unknown>): string {
  return JSON.stringify(obj)
}
