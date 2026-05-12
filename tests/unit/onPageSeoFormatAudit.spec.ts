import { describe, expect, it } from 'vitest'

import { markdownToPageBodyLexical } from '@/utilities/sitePagesBundleContent/markdownToPayloadLexical'
import {
  auditOnPageSeoFormat,
  onPageSeoFormatRequirements,
} from '@/utilities/onPageSeoFormatAudit'
import { getSeoPublishQuality80ProfileFields } from '@/utilities/seoTheoryPipelineProfilePresets'

function publishQualityRequirements() {
  const fields = getSeoPublishQuality80ProfileFields(false) as {
    articleStrategy: Record<string, unknown>
  }
  const req = onPageSeoFormatRequirements(fields.articleStrategy)
  if (!req) throw new Error('expected on-page requirements')
  return req
}

function longSeoMarkdown(): string {
  const para =
    'This section gives practical buying guidance with concrete tradeoffs for grip, thickness, material safety, sizing, cleaning, durability, and daily use. It avoids filler by explaining how a reader can compare real products and choose the mat that fits a specific practice routine.'
  const sections = [
    'Best Yoga Mat Buying Criteria',
    'Match the Mat to Your Practice Style',
    'Dry Grip vs Wet Grip',
    'Yoga Mat Thickness Guide',
    'Material Safety and Durability',
    'Size, Weight, and Portability',
    'Cleaning and Maintenance',
    'Budget and Cost Per Use',
    'Common Mistakes to Avoid',
  ]
  const out: string[] = []
  for (const [i, section] of sections.entries()) {
    out.push(`## ${section}`)
    if (i < 4) out.push(`### ${section} details`)
    out.push(para, para, para, para, para)
  }
  out.push('## Yoga Mat Buying Checklist')
  out.push(
    '- Check dry grip',
    '- Check wet grip',
    '- Confirm thickness',
    '- Read material disclosure',
    '- Confirm length',
    '- Check cleaning routine',
  )
  out.push('## FAQ')
  out.push('### What thickness is best for beginners?')
  out.push(para, para)
  out.push('## Final Recommendation')
  out.push(para, para)
  return out.join('\n\n')
}

describe('on-page SEO format audit', () => {
  it('passes a long SEO-formatted Lexical body for the 80+ strategy', () => {
    const body = markdownToPageBodyLexical(longSeoMarkdown())
    const audit = auditOnPageSeoFormat(body, publishQualityRequirements())
    expect(audit.missing).toEqual([])
    expect(audit.metrics.wordCount).toBeGreaterThanOrEqual(2000)
    expect(audit.metrics.h2Count).toBeGreaterThanOrEqual(8)
    expect(audit.metrics.h3Count).toBeGreaterThanOrEqual(4)
    expect(audit.metrics.hasFaq).toBe(true)
    expect(audit.metrics.hasChecklist).toBe(true)
    expect(audit.score).toBeGreaterThanOrEqual(80)
  })

  it('flags short paragraph-only bodies before publish', () => {
    const body = markdownToPageBodyLexical(
      'This is a short preview draft. It has useful words but no SEO article structure.',
    )
    const audit = auditOnPageSeoFormat(body, publishQualityRequirements())
    expect(audit.score).toBeLessThan(80)
    expect(audit.missing.join(' ')).toContain('requires at least 2000')
    expect(audit.missing.join(' ')).toContain('H2')
    expect(audit.missing.join(' ')).toContain('FAQ')
    expect(audit.missing.join(' ')).toContain('checklist')
  })
})
