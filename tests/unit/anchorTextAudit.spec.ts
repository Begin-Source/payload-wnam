import { describe, expect, it } from 'vitest'

import { auditAnchorsForSite } from '@/utilities/anchorTextAudit'

describe('auditAnchorsForSite', () => {
  it('should flag high exact-match ratio', () => {
    const edges = Array.from({ length: 10 }, () => ({
      toId: 't1',
      anchorText: 'same',
      anchorType: 'exact' as const,
    }))
    const r = auditAnchorsForSite('1', edges)
    expect(r[0]?.overOptimized).toBe(true)
  })

  it('should flag generic anchors', () => {
    const edges: { toId: string; anchorText: string; anchorType?: string | null }[] = [
      { toId: 'x', anchorText: 'click here', anchorType: undefined },
      { toId: 'x', anchorText: 'good anchor', anchorType: undefined },
    ]
    const r = auditAnchorsForSite('1', edges)
    expect(r[0]?.genericAnchorOveruse).toBe(true)
  })
})
