/**
 * Lightweight publish-readiness heuristic for **markdown bodies** (local CI / smoke).
 * Not a substitute for the full CORE-EEAT 80-item skill audit on real LLM output.
 */
import { describe, expect, it } from 'vitest'

import {
  scoreArticleMarkdownPublishHeuristic,
  scorePublishReadyPlainText,
} from '@/utilities/articleMarkdownPublishHeuristic'

/** Simulates a stronger pipeline output (authority preset goals). */
const STRONG_SAMPLE = `# Wireless Mouse X200: Hands-On for Office Work

## Direct answer
The X200 is a quiet, comfortable option for all-day spreadsheet work if you do not need a gaming-grade sensor. In our sample week the scroll encoder stayed consistent on long Google Sheets sessions, and we did not notice double-click issues that sometimes appear on budget switches after heavy use.

## What we tested
We used the mouse for 10 working days on macOS and Windows, tracking battery via the vendor app. Daily workload mixed email, spreadsheets, and light photo editing. We logged scroll wheel usage and repeated the same copy-paste stress loop to compare against two prior office mice from other brands. Noise readings were informal but consistent: clicks were noticeably softer than a common OEM bundled mouse on the same desk mat.

Battery dropped roughly twelve percent per eight-hour day with LED lighting disabled. Your mileage may vary if you keep RGB effects on.

Bluetooth reconnection after sleep was instant on Apple Silicon and required one manual reconnect on an older Windows laptop after hibernate.

## Pros and cons
### Strengths
- Strong battery life in our sample week
- Comfortable shape for medium hands
- Bluetooth pairing was stable

### Weaknesses
Cons:
- Side buttons feel slightly mushy

## Who should buy
Buy if you want low click noise in an open office. Skip if you need ultra-light esports mice.

If your hand size sits between small and medium, the hump height may feel tall for palm grip users; claw and fingertip grips felt more natural in our notes.

## FAQ
**Q: Does it work over Bluetooth only?** A: Yes; a USB receiver is not required for our unit.

## Disclosure
We may earn a commission if you purchase through [Example Shop](https://example.com/p/x200). Prices were accurate at research time; offers change.

`

const THIN_SAMPLE = `# Good product

It is nice. You should buy it.

`

describe('sample article markdown publish heuristic (local smoke)', () => {
  it('scores structured sample at or above 80/100', () => {
    const score = scoreArticleMarkdownPublishHeuristic(STRONG_SAMPLE)
    expect(score).toBeGreaterThanOrEqual(80)
  })

  it('scores thin marketing blurbs below publish bar', () => {
    expect(scoreArticleMarkdownPublishHeuristic(THIN_SAMPLE)).toBeLessThan(55)
  })
})

describe('scorePublishReadyPlainText (Lexical-style plain)', () => {
  it('scores long structured plain text at or above 80 when FAQ and disclosure present', () => {
    const para =
      'This paragraph discusses methodology, constraints, and repeatable observations from hands-on testing. We compared three SKUs and logged battery drain per eight-hour workday on macOS and Windows with identical desk setups.'
    const chunks = Array.from({ length: 14 }, (_, i) => `Block ${i + 1}. ${para}`)
    const bullets = ['- Point one with specifics', '- Point two with tradeoffs', '- Point three with data', '- Fourth takeaway', '- Fifth note', '- Sixth caution']
    const plain = `${chunks.join('\n\n')}\n\n${bullets.join('\n')}\n\nFAQ: common questions appear here. Q: Does it support Bluetooth? A: Yes in our sample.\n\nDisclosure: we may earn a commission if you purchase through https://example.com/offer.\n\nMore detail after disclosure repeats findings and links https://example.com/docs for specifications and warranty terms.`
    expect(scorePublishReadyPlainText(plain)).toBeGreaterThanOrEqual(80)
  })
})
