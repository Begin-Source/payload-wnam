import { describe, expect, it } from 'vitest'

import { normalizeGlobalPipelineDoc } from '@/utilities/pipelineSettingShape'
import { formatSeoWorkflowPromptBlock } from '@/utilities/seoWorkflowPromptBlock'

describe('formatSeoWorkflowPromptBlock', () => {
  it('includes seoWorkflow fields and pipeline knobs', () => {
    const merged = normalizeGlobalPipelineDoc({
      briefDepth: 'deep',
      articleStrategy: {
        seoWorkflow: {
          workflowMode: 'one_click_publish_grade',
          qualityTier: 'publish_grade',
          targetTotalWords: 2000,
          minSpecificityAnchorsPerSection: 4,
          directAnswerLeadWords: 90,
          requireMethodSection: true,
          editorNotes: 'Test note',
        },
      },
      amzKeywordEligibility: {
        intentWhitelist: ['commercial'],
        minVolume: 100,
        maxKd: 40,
        minOpportunityScore: 30,
      },
    })
    const block = formatSeoWorkflowPromptBlock(merged)
    expect(block).toContain('workflowMode: one_click_publish_grade')
    expect(block).toContain('targetTotalWords: ~2000')
    expect(block).toContain('onPageSeoFormat:')
    expect(block).toContain('no # H1')
    expect(block).toContain('2000 body words')
    expect(block).toContain('8+ ## H2')
    expect(block).toContain('4+ ### H3')
    expect(block).toContain('requireMethodSection: true')
    expect(block).toContain('briefDepth: deep')
    expect(block).toContain('keywordEligibility:')
    expect(block).toContain('Test note')
  })
})
