import { describe, expect, it } from 'vitest'

import {
  articleIdFromJob,
  briefIdFromJob,
  keywordIdFromJob,
  siteIdFromJob,
  type WorkflowJobDoc,
} from '@/app/api/pipeline/lib/workflowJobRunner'

describe('articleIdFromJob', () => {
  it('should prefer article relation id', () => {
    const job: WorkflowJobDoc = {
      id: 1,
      article: { id: 7 },
      input: { articleId: '9' },
    }
    expect(articleIdFromJob(job)).toBe('7')
  })

  it('should fall back to input.articleId', () => {
    const job: WorkflowJobDoc = {
      id: 1,
      input: { articleId: '12' },
    }
    expect(articleIdFromJob(job)).toBe('12')
  })

  it('should return null when missing', () => {
    expect(articleIdFromJob({ id: 1 })).toBeNull()
  })
})

describe('siteIdFromJob', () => {
  it('should read site relation', () => {
    expect(siteIdFromJob({ id: 1, site: { id: 3 } })).toBe('3')
  })
})

describe('keywordIdFromJob', () => {
  it('should prefer pipelineKeyword relation', () => {
    expect(keywordIdFromJob({ id: 1, pipelineKeyword: { id: 5 }, input: { keywordId: '9' } })).toBe('5')
  })

  it('should fall back to input.keywordId', () => {
    expect(keywordIdFromJob({ id: 1, input: { keywordId: 11 } })).toBe('11')
  })
})

describe('briefIdFromJob', () => {
  it('should prefer contentBrief relation', () => {
    expect(briefIdFromJob({ id: 1, contentBrief: { id: 8 }, input: { briefId: '2' } })).toBe('8')
  })
})
