import { describe, expect, it } from 'vitest'

import { formatBrandDocumentTitle, stripPayloadProductSuffix } from '@/utilities/adminBrandingTitle'

describe('stripPayloadProductSuffix', () => {
  it('removes trailing Payload product segment', () => {
    expect(stripPayloadProductSuffix('社交平台 - Payload')).toBe('社交平台')
    expect(stripPayloadProductSuffix('Dashboard – Payload CMS')).toBe('Dashboard')
  })

  it('returns empty when title is only Payload', () => {
    expect(stripPayloadProductSuffix('Payload')).toBe('')
    expect(stripPayloadProductSuffix('Payload CMS')).toBe('')
  })
})

describe('formatBrandDocumentTitle', () => {
  it('strips Payload suffix and appends brand', () => {
    expect(formatBrandDocumentTitle('Dashboard - Payload', 'Acme')).toBe('Dashboard | Acme')
    expect(formatBrandDocumentTitle('List – Payload CMS', 'Acme')).toBe('List | Acme')
    expect(formatBrandDocumentTitle('Edit | Payload', 'Acme')).toBe('Edit | Acme')
    expect(formatBrandDocumentTitle('社交平台 - Payload', 'Acme')).toBe('社交平台 | Acme')
    expect(formatBrandDocumentTitle('社交平台\uFF0D Payload', 'Acme')).toBe('社交平台 | Acme')
  })

  it('is idempotent when already branded', () => {
    const t = 'Dashboard | Acme'
    expect(formatBrandDocumentTitle(t, 'Acme')).toBe(t)
  })

  it('returns only brand when title is only Payload product name', () => {
    expect(formatBrandDocumentTitle('Payload', 'Acme')).toBe('Acme')
    expect(formatBrandDocumentTitle('Payload CMS', 'Acme')).toBe('Acme')
  })

  it('returns raw when brandName is empty (caller should skip)', () => {
    expect(formatBrandDocumentTitle('Dashboard - Payload', '')).toBe('Dashboard - Payload')
  })
})
