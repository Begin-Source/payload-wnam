import { describe, expect, it, vi } from 'vitest'

import { SERP_BRIEF_SYSTEM } from '@/utilities/domainGeneration/promptKeys'
import { loadTenantPromptTemplateBody } from '@/utilities/openRouterTenantPrompts/loadTenantPromptTemplateBody'
import type { Payload } from 'payload'

function payloadWithFindSequence(
  responses: Array<{ docs: Array<{ body?: string }> }>,
): Payload {
  let i = 0
  return {
    find: vi.fn(async () => {
      const r = responses[i] ?? { docs: [] }
      i += 1
      return r
    }),
  } as unknown as Payload
}

describe('loadTenantPromptTemplateBody pipeline profile scope', () => {
  it('returns scoped template with one query when pipelineProfileId set and row exists', async () => {
    const payload = payloadWithFindSequence([{ docs: [{ body: '  scoped  ' }] }])
    const b = await loadTenantPromptTemplateBody(payload, 1, SERP_BRIEF_SYSTEM, 7)
    expect(b).toBe('scoped')
    expect(payload.find).toHaveBeenCalledTimes(1)
  })

  it('falls back to global tenant key when scoped miss', async () => {
    const payload = payloadWithFindSequence([{ docs: [] }, { docs: [{ body: 'global-default' }] }])
    const b = await loadTenantPromptTemplateBody(payload, 1, SERP_BRIEF_SYSTEM, 99)
    expect(b).toBe('global-default')
    expect(payload.find).toHaveBeenCalledTimes(2)
  })

  it('queries only global row when pipelineProfileId is null', async () => {
    const payload = payloadWithFindSequence([{ docs: [{ body: 'g' }] }])
    const b = await loadTenantPromptTemplateBody(payload, 1, SERP_BRIEF_SYSTEM, null)
    expect(b).toBe('g')
    expect(payload.find).toHaveBeenCalledTimes(1)
  })
})
