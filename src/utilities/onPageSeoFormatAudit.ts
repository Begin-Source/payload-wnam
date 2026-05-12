export type OnPageSeoFormatRequirements = {
  minWords: number
  minH2Count: number
  minH3Count: number
  requireFaqSection: boolean
  requireChecklistSection: boolean
  disallowBodyH1: boolean
}

export type OnPageSeoFormatMetrics = {
  wordCount: number
  blockCount: number
  h1Count: number
  h2Count: number
  h3Count: number
  bulletCount: number
  hasFaq: boolean
  hasChecklist: boolean
  hasFinalRecommendation: boolean
}

export type OnPageSeoFormatAudit = {
  requirements: OnPageSeoFormatRequirements | null
  metrics: OnPageSeoFormatMetrics
  score: number
  missing: string[]
}

const DEFAULT_LONG_FORM_MIN_WORDS = 2000
const DEFAULT_LONG_FORM_MIN_H2 = 8
const DEFAULT_LONG_FORM_MIN_H3 = 4

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
}

function num(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : null
}

function bool(raw: unknown): boolean | null {
  return typeof raw === 'boolean' ? raw : null
}

export function onPageSeoFormatRequirements(
  articleStrategy: unknown,
): OnPageSeoFormatRequirements | null {
  const root = asRecord(articleStrategy)
  if (!root) return null
  const sw = asRecord(root.seoWorkflow)
  const gate = asRecord(root.contentQualityGate)
  const targetWords = num(sw?.targetTotalWords)
  const minWords =
    num(gate?.minWords) ??
    num(sw?.minOnPageWords) ??
    (targetWords != null && targetWords >= DEFAULT_LONG_FORM_MIN_WORDS ?
      DEFAULT_LONG_FORM_MIN_WORDS
    : 0)
  const minH2Count =
    num(gate?.minH2Count) ??
    num(sw?.minH2Count) ??
    (minWords >= DEFAULT_LONG_FORM_MIN_WORDS ? DEFAULT_LONG_FORM_MIN_H2 : 0)
  const minH3Count =
    num(gate?.minH3Count) ??
    num(sw?.minH3Count) ??
    (minWords >= DEFAULT_LONG_FORM_MIN_WORDS ? DEFAULT_LONG_FORM_MIN_H3 : 0)
  const enabled =
    minWords > 0 ||
    minH2Count > 0 ||
    minH3Count > 0 ||
    bool(gate?.requireFaqSection) === true ||
    bool(sw?.requireFaqSection) === true ||
    bool(gate?.requireChecklistSection) === true ||
    bool(sw?.requireChecklistSection) === true ||
    bool(gate?.disallowBodyH1) === true ||
    bool(sw?.disallowBodyH1) === true
  if (!enabled) return null

  const longForm = minWords >= DEFAULT_LONG_FORM_MIN_WORDS
  return {
    minWords,
    minH2Count,
    minH3Count,
    requireFaqSection: bool(gate?.requireFaqSection) ?? bool(sw?.requireFaqSection) ?? longForm,
    requireChecklistSection:
      bool(gate?.requireChecklistSection) ?? bool(sw?.requireChecklistSection) ?? longForm,
    disallowBodyH1: bool(gate?.disallowBodyH1) ?? bool(sw?.disallowBodyH1) ?? longForm,
  }
}

function collectText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const row = node as Record<string, unknown>
  if (row.type === 'text' && typeof row.text === 'string') return row.text
  if (row.type === 'linebreak') return '\n'
  const children = row.children
  if (!Array.isArray(children)) return ''
  return children.map((child) => collectText(child)).join('')
}

function walk(node: unknown, metrics: OnPageSeoFormatMetrics, textParts: string[]): void {
  if (!node || typeof node !== 'object') return
  const row = node as Record<string, unknown>
  const type = row.type
  const text = collectText(node).replace(/\u200b/g, '').trim()
  if (text) textParts.push(text)

  if (type === 'heading') {
    metrics.blockCount += 1
    const tag = typeof row.tag === 'string' ? row.tag.toLowerCase() : ''
    if (tag === 'h1') metrics.h1Count += 1
    if (tag === 'h2') metrics.h2Count += 1
    if (tag === 'h3') metrics.h3Count += 1
    if (/\bfaq\b|frequently asked questions/i.test(text)) metrics.hasFaq = true
    if (/checklist|buying checklist|purchase checklist|selection checklist/i.test(text)) {
      metrics.hasChecklist = true
    }
    if (/final recommendation|conclusion|summary|final verdict/i.test(text)) {
      metrics.hasFinalRecommendation = true
    }
  } else if (type === 'paragraph') {
    metrics.blockCount += 1
    if (/^\s*[-*•]\s+\S/.test(text)) metrics.bulletCount += 1
    if (/\bfaq\b|frequently asked questions/i.test(text)) metrics.hasFaq = true
    if (/checklist|buying checklist|purchase checklist|selection checklist/i.test(text)) {
      metrics.hasChecklist = true
    }
    if (/final recommendation|conclusion|summary|final verdict/i.test(text)) {
      metrics.hasFinalRecommendation = true
    }
  } else if (type === 'listitem') {
    metrics.bulletCount += 1
  }

  const children = row.children
  if (Array.isArray(children) && type !== 'heading' && type !== 'paragraph' && type !== 'listitem') {
    for (const child of children) walk(child, metrics, textParts)
  }
}

export function auditOnPageSeoFormat(
  body: unknown,
  requirements: OnPageSeoFormatRequirements | null,
): OnPageSeoFormatAudit {
  const metrics: OnPageSeoFormatMetrics = {
    wordCount: 0,
    blockCount: 0,
    h1Count: 0,
    h2Count: 0,
    h3Count: 0,
    bulletCount: 0,
    hasFaq: false,
    hasChecklist: false,
    hasFinalRecommendation: false,
  }
  const root = asRecord(body)?.root
  const children = asRecord(root)?.children
  const textParts: string[] = []
  if (Array.isArray(children)) {
    for (const child of children) walk(child, metrics, textParts)
  }
  const allText = textParts.join(' ')
  metrics.wordCount = allText.trim() ? allText.trim().split(/\s+/).filter(Boolean).length : 0

  const req = requirements
  const effective = req ?? {
    minWords: DEFAULT_LONG_FORM_MIN_WORDS,
    minH2Count: DEFAULT_LONG_FORM_MIN_H2,
    minH3Count: DEFAULT_LONG_FORM_MIN_H3,
    requireFaqSection: true,
    requireChecklistSection: true,
    disallowBodyH1: true,
  }
  const missing: string[] = []
  if (req?.minWords && metrics.wordCount < req.minWords) {
    missing.push(`Body has ${metrics.wordCount} words; requires at least ${req.minWords}.`)
  }
  if (req?.minH2Count && metrics.h2Count < req.minH2Count) {
    missing.push(`Body has ${metrics.h2Count} H2 sections; requires at least ${req.minH2Count}.`)
  }
  if (req?.minH3Count && metrics.h3Count < req.minH3Count) {
    missing.push(`Body has ${metrics.h3Count} H3 sections; requires at least ${req.minH3Count}.`)
  }
  if (req?.requireFaqSection && !metrics.hasFaq) missing.push('Add a dedicated FAQ section.')
  if (req?.requireChecklistSection && !metrics.hasChecklist) {
    missing.push('Add a buyer-facing checklist section.')
  }
  if (req?.disallowBodyH1 && metrics.h1Count > 0) {
    missing.push('Remove H1 from the CMS body; the page title is the only H1.')
  }

  const wordScore =
    effective.minWords > 0 ?
      Math.min(30, Math.floor((metrics.wordCount / effective.minWords) * 30))
    : metrics.wordCount >= 1200 ? 30
    : metrics.wordCount >= 700 ? 20
    : 10
  const score =
    wordScore +
    Math.min(14, effective.minH2Count > 0 ? Math.floor((metrics.h2Count / effective.minH2Count) * 14) : 14) +
    Math.min(10, effective.minH3Count > 0 ? Math.floor((metrics.h3Count / effective.minH3Count) * 10) : 10) +
    (metrics.h1Count === 0 ? 8 : 0) +
    (metrics.hasFaq ? 8 : 0) +
    (metrics.hasChecklist ? 8 : 0) +
    (metrics.bulletCount >= 6 ? 8 : metrics.bulletCount >= 3 ? 5 : 0) +
    (metrics.blockCount >= 16 ? 8 : metrics.blockCount >= 10 ? 5 : 0) +
    (metrics.hasFinalRecommendation ? 6 : 0)

  return { requirements, metrics, score: Math.min(100, Math.max(0, Math.round(score))), missing }
}
