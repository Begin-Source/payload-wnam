import type { Payload } from 'payload'

import { openrouterChatWithMeta } from '@/services/integrations/openrouter/chat'
import { recordOpenRouterAiCost } from '@/utilities/aiCostLog'
import { buildSiteUpdatePatch } from '@/utilities/domainGeneration/buildSitePatch'
import {
  resolveAudienceStepPrompts,
  resolveDomainStepPrompts,
} from '@/utilities/domainGeneration/resolveDomainGenPrompts'
import { parseAndPickAudiences } from '@/utilities/domainGeneration/parseAudiences'
import { parseDomainCandidatesFromAi } from '@/utilities/domainGeneration/parseDomainCandidates'
import { checkSpaceshipDomains } from '@/utilities/domainGeneration/spaceship'
import { incrementSiteQuotaUsage } from '@/utilities/siteQuotaCheck'
import { tenantIdFromRelation } from '@/utilities/tenantScope'

export type SiteDocForDomainGen = {
  id: string | number
  name: string
  mainProduct?: string | null
  primaryDomain: string
  nicheData?: Record<string, unknown> | null
  domainGenerationLog?: string | null
  tenant?: number | { id: number } | null
}

function asNicheRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw) as unknown
      if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>
    } catch {
      /* ignore */
    }
  }
  return {}
}

function wrapChatContent(text: string): Record<string, unknown> {
  return { choices: [{ message: { content: text } }] }
}

export type RunDomainGenerationResult =
  | {
      ok: true
      detail: ReturnType<typeof buildSiteUpdatePatch>['detail']
    }
  | { ok: false; siteId: string; error: string }

const OPENROUTER_DOMAIN_USD = 0.012

const DOMAIN_WORKFLOW_RUNNING_MESSAGE =
  '域名生成进行中：受众 → 域名建议 → Spaceship 可查（请勿重复提交直至完成）。'

/** 将站点标为域名流程「运行中」（与长流程首步一致；失败返回 false，调用方可决定是否强校验）。 */
export async function markSiteDomainWorkflowRunning(
  payload: Payload,
  siteId: string | number,
): Promise<boolean> {
  const idStr = String(siteId)
  try {
    await payload.update({
      collection: 'sites',
      id: idStr,
      data: {
        domainWorkflowStatus: 'running',
        domainCheckAt: new Date().toISOString(),
        domainCheckMessage: DOMAIN_WORKFLOW_RUNNING_MESSAGE,
      } as Record<string, unknown>,
      overrideAccess: true,
    })
    return true
  } catch {
    return false
  }
}

export async function runDomainGenerationForSite(
  payload: Payload,
  siteId: string | number,
  opts: { force: boolean; aiModel: string; mainProduct?: string | null; signal?: AbortSignal },
): Promise<RunDomainGenerationResult> {
  const idStr = String(siteId)
  let site: SiteDocForDomainGen
  try {
    site = (await payload.findByID({
      collection: 'sites',
      id: idStr,
      depth: 0,
      overrideAccess: true,
    })) as unknown as SiteDocForDomainGen
  } catch {
    return { ok: false, siteId: idStr, error: 'Site not found' }
  }

  const mainProductOverride = String(opts.mainProduct ?? '').trim()
  const mainProduct = mainProductOverride || String(site.mainProduct ?? '').trim()
  const siteName = String(site.name ?? '').trim()
  const nicheData = asNicheRecord(site.nicheData)
  const niche = String(nicheData.niche ?? '').trim()
  const currentAudience = String(nicheData.target_audience ?? '').trim()
  const currentLog = String(site.domainGenerationLog ?? '')
  const currentDomain = String(site.primaryDomain ?? '').trim()

  try {
    await markSiteDomainWorkflowRunning(payload, siteId)

    const sid = typeof siteId === 'number' ? siteId : Number(siteId)

    const baseTopic = (mainProduct || siteName || niche).trim()
    if (!baseTopic) {
      throw new Error('main_product/site_name/niche are all empty')
    }

    const tenantId = tenantIdFromRelation(site.tenant)

    let audienceText = ''
    let audienceError = false
    try {
      const ap = await resolveAudienceStepPrompts(payload, tenantId, {
        mainProduct,
        siteName,
        niche,
        currentAudience,
      })
      const ar = await openrouterChatWithMeta(
        opts.aiModel,
        [
          { role: 'system', content: ap.system },
          { role: 'user', content: ap.user },
        ],
        {
          responseFormatJson: true,
          temperature: 0.7,
          signal: opts.signal,
        },
      )
      audienceText = ar.text
      if (Number.isFinite(sid)) {
        try {
          await recordOpenRouterAiCost({
            payload,
            target: { collection: 'sites', id: sid },
            model: opts.aiModel,
            usage: ar.usage,
            raw: ar.raw,
            kind: 'domain_generation_audience',
          })
        } catch {
          /* optional */
        }
      }
    } catch {
      audienceError = true
    }

    const aud = parseAndPickAudiences(audienceText, { mainProduct, siteName }, audienceError)

    const dp = await resolveDomainStepPrompts(payload, tenantId, {
      mainProduct,
      siteName,
      niche,
      selectedAudience: aud.selectedAudience,
      audienceCandidates: aud.audienceCandidates,
      currentPrimaryDomain: currentDomain,
    })

    let domainRaw: unknown
    try {
      const dr = await openrouterChatWithMeta(
        opts.aiModel,
        [
          { role: 'system', content: dp.system },
          { role: 'user', content: dp.user },
        ],
        {
          responseFormatJson: true,
          temperature: 0.3,
          signal: opts.signal,
        },
      )
      domainRaw = wrapChatContent(dr.text)
      if (Number.isFinite(sid)) {
        try {
          await recordOpenRouterAiCost({
            payload,
            target: { collection: 'sites', id: sid },
            model: opts.aiModel,
            usage: dr.usage,
            raw: dr.raw,
            kind: 'domain_generation_domain',
          })
        } catch {
          /* optional */
        }
      }
    } catch {
      domainRaw = { error: { message: 'OpenRouter domain step failed' } }
    }

    const parsedBatch = parseDomainCandidatesFromAi(domainRaw, {
      mainProduct,
      siteName,
    })

    const spaceship = await checkSpaceshipDomains(parsedBatch.candidates, { signal: opts.signal })

    const { patch, detail } = buildSiteUpdatePatch({
      siteId: idStr,
      force: opts.force,
      currentPrimaryDomain: currentDomain,
      currentName: siteName,
      currentLog,
      nicheData,
      candidates: parsedBatch.candidates,
      siteNameMap: parsedBatch.siteNameMap,
      spaceship,
      selectedAudience: aud.selectedAudience,
      audienceCandidates: aud.audienceCandidates,
    })

    const data: Record<string, unknown> = { ...(patch as Record<string, unknown>) }
    if (mainProductOverride) {
      data.mainProduct = mainProductOverride
    }

    await payload.update({
      collection: 'sites',
      id: idStr,
      data,
      overrideAccess: true,
    })

    if (Number.isFinite(sid)) {
      try {
        await incrementSiteQuotaUsage(payload, sid, { openrouterUsd: OPENROUTER_DOMAIN_USD * 2 })
      } catch {
        /* non-fatal */
      }
    }

    return { ok: true, detail }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    try {
      await payload.update({
        collection: 'sites',
        id: idStr,
        data: {
          domainWorkflowStatus: 'error',
          domainCheckStatus: 'error',
          domainCheckAvailable: false,
          domainCheckAt: new Date().toISOString(),
          domainCheckMessage: msg.slice(0, 1000),
        } as Record<string, unknown>,
        overrideAccess: true,
      })
    } catch {
      /* ignore */
    }
    return { ok: false, siteId: idStr, error: msg }
  }
}
