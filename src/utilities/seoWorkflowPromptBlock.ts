import type { PipelineSettingShape } from '@/utilities/pipelineSettingShape'

/**
 * Optional `articleStrategy.seoWorkflow` JSON — drives one-click / publish-grade behavior
 * textually injected into SERP brief, draft_section, and finalize tenant prompts.
 */
export type SeoWorkflowParams = {
  workflowMode?: string
  qualityTier?: string
  contentArchetypes?: string[]
  targetTotalWords?: number
  minSpecificityAnchorsPerSection?: number
  directAnswerLeadWords?: number
  requireMethodSection?: boolean
  editorNotes?: string
}

function pickSeoWorkflow(articleStrategy: unknown): SeoWorkflowParams | null {
  if (articleStrategy == null || typeof articleStrategy !== 'object' || Array.isArray(articleStrategy)) {
    return null
  }
  const sw = (articleStrategy as Record<string, unknown>).seoWorkflow
  if (sw == null || typeof sw !== 'object' || Array.isArray(sw)) return null
  return sw as SeoWorkflowParams
}

function summarizeKeywordEligibility(raw: unknown): string | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const intent = o.intentWhitelist
  const intents =
    Array.isArray(intent) ? intent.map((x) => String(x)).filter(Boolean).join(', ') : ''
  const minV = o.minVolume
  const maxKd = o.maxKd
  const minOpp = o.minOpportunityScore
  const parts: string[] = []
  if (intents) parts.push(`intentWhitelist=[${intents}]`)
  if (typeof minV === 'number' && Number.isFinite(minV)) parts.push(`minVolume≥${minV}`)
  if (typeof maxKd === 'number' && Number.isFinite(maxKd)) parts.push(`maxKd≤${maxKd}`)
  if (typeof minOpp === 'number' && Number.isFinite(minOpp)) parts.push(`minOpportunityScore≥${minOpp}`)
  return parts.length ? parts.join('; ') : null
}

function summarizeWordTargets(articleStrategy: unknown): string | null {
  if (articleStrategy == null || typeof articleStrategy !== 'object' || Array.isArray(articleStrategy)) {
    return null
  }
  const o = articleStrategy as Record<string, unknown>
  const byType = o.wordCountTarget
  if (!byType || typeof byType !== 'object' || Array.isArray(byType)) {
    const flat = o.maxWordsPerSection
    if (typeof flat === 'number' && Number.isFinite(flat)) {
      return `maxWordsPerSection≈${Math.floor(flat)}`
    }
    return null
  }
  const keys = Object.keys(byType as Record<string, unknown>).slice(0, 12)
  return keys.length ? `wordCountTarget sections: ${keys.join(', ')}` : null
}

/**
 * Markdown block for LLM system prompts — merged pipeline + optional `articleStrategy.seoWorkflow`.
 */
export function formatSeoWorkflowPromptBlock(merged: PipelineSettingShape, maxLen = 2800): string {
  const lines: string[] = []
  const sw = pickSeoWorkflow(merged.articleStrategy)

  if (sw?.workflowMode) lines.push(`- workflowMode: ${sw.workflowMode}`)
  if (sw?.qualityTier) lines.push(`- qualityTier: ${sw.qualityTier}`)
  if (Array.isArray(sw?.contentArchetypes) && sw.contentArchetypes.length) {
    lines.push(`- contentArchetypes: ${sw.contentArchetypes.join(', ')}`)
  }
  if (typeof sw?.targetTotalWords === 'number' && Number.isFinite(sw.targetTotalWords)) {
    lines.push(`- targetTotalWords: ~${Math.floor(sw.targetTotalWords)}`)
  }
  if (typeof sw?.minSpecificityAnchorsPerSection === 'number' && Number.isFinite(sw.minSpecificityAnchorsPerSection)) {
    lines.push(`- minSpecificityAnchorsPerSection: ${Math.floor(sw.minSpecificityAnchorsPerSection)}`)
  }
  if (typeof sw?.directAnswerLeadWords === 'number' && Number.isFinite(sw.directAnswerLeadWords)) {
    lines.push(`- directAnswerLeadWords: ${Math.floor(sw.directAnswerLeadWords)}`)
  }
  if (sw?.requireMethodSection === true) {
    lines.push('- requireMethodSection: true (brief must plan a method / evaluation section)')
  }
  if (typeof sw?.editorNotes === 'string' && sw.editorNotes.trim()) {
    lines.push(`- editorNotes: ${sw.editorNotes.trim().replace(/\s+/g, ' ').slice(0, 400)}`)
  }

  lines.push(`- briefDepth: ${merged.briefDepth}`)
  lines.push(`- briefVariant: ${merged.briefVariant}`)
  lines.push(`- skeletonVariant: ${merged.skeletonVariant}`)
  lines.push(`- sectionVariant: ${merged.sectionVariant}`)
  lines.push(`- finalizeVariant: ${merged.finalizeVariant}`)
  lines.push(`- research: Tavily ${merged.tavilyEnabled ? 'on' : 'off'}; DataForSEO ${merged.dataForSeoEnabled ? 'on' : 'off'}`)
  lines.push(`- frugalMode: ${merged.frugalMode ? 'true' : 'false'}`)
  lines.push(`- sectionMaxRetry: ${merged.sectionMaxRetry}`)

  const elig = summarizeKeywordEligibility(merged.amzKeywordEligibility)
  if (elig) lines.push(`- keywordEligibility: ${elig}`)

  const wc = summarizeWordTargets(merged.articleStrategy)
  if (wc) lines.push(`- ${wc}`)

  const head = '## Parameterized SEO workflow (runtime)\n'
  const body = `${head}${lines.join('\n')}\n`
  if (body.length <= maxLen) return body
  return `${body.slice(0, Math.max(0, maxLen - 2))}…\n`
}
