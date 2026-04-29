import { domainToSlug } from '@/utilities/domainGeneration/domainToSlug'
import { domainToSiteName, normalizeDomain, toTitleCase } from '@/utilities/domainGeneration/parseDomainCandidates'
import type { SpaceshipAvailabilityResponse } from '@/utilities/domainGeneration/spaceship'
import { isPremiumDomainRow } from '@/utilities/domainGeneration/spaceship'

const PLACEHOLDER_DOMAIN = '????????,?????'
const LOG_MAX = 12_000

export type BuildPatchInput = {
  siteId: string
  force: boolean
  currentPrimaryDomain: string
  currentName: string
  currentLog: string
  nicheData: Record<string, unknown>
  candidates: string[]
  siteNameMap: Record<string, string>
  spaceship: SpaceshipAvailabilityResponse
  selectedAudience: string
  audienceCandidates: string[]
}

export type SiteDomainGenerationPatch = {
  primaryDomain?: string
  slug?: string
  name?: string
  nicheData?: Record<string, unknown>
  domainGenerationLog?: string
  domainCheckStatus?: string
  domainCheckAvailable?: boolean
  domainCheckAt?: string
  domainCheckMessage?: string
  domainWorkflowStatus?: 'idle' | 'running' | 'done' | 'error'
}

export type BuildPatchResult = {
  patch: SiteDomainGenerationPatch
  detail: {
    site_id: string
    force: boolean
    current_domain: string | null
    applied_domain: string | null
    selected_audience: string | null
    audience_candidates: string[]
    selected_domain: string | null
    available_domains: string[]
    premium_available_domains: string[]
    checked_domains: string[]
    status: string
    message: string
  }
}

export function mergeDomainLog(prev: string, entry: string, maxLen = LOG_MAX): string {
  const prevLog = String(prev || '').trim()
  const merged = prevLog ? `${prevLog}\n\n${entry}` : entry
  return merged.length > maxLen ? merged.slice(-maxLen) : merged
}

/** n8n「Build Site Update Payload」+「Attach Site Name」等价。 */
export function buildSiteUpdatePatch(input: BuildPatchInput): BuildPatchResult {
  const now = new Date().toISOString()
  const {
    siteId,
    force,
    currentPrimaryDomain: currentDomainRaw,
    nicheData: nicheIn,
    candidates,
    siteNameMap: siteNameMapRaw,
    spaceship: resp,
    selectedAudience,
    audienceCandidates,
  } = input

  const currentDomain = currentDomainRaw.trim().toLowerCase()
  const forceBool = force === true || String(force).toLowerCase() === 'true'

  const siteNameMap =
    siteNameMapRaw && typeof siteNameMapRaw === 'object' && !Array.isArray(siteNameMapRaw)
      ? Object.fromEntries(
          Object.entries(siteNameMapRaw)
            .map(([k, v]) => [String(k || '').trim().toLowerCase(), toTitleCase(String(v || ''))])
            .filter(([k, v]) => k && v),
        )
      : {}

  const resultRows = Array.isArray(resp.domains) ? resp.domains : []

  const availabilityMap = new Map<
    string,
    { available: boolean; premium: boolean; result: string; message: string }
  >()
  for (const row of resultRows) {
    const domain = String(row?.domain || '').toLowerCase()
    if (!domain) continue
    const result = String(row?.result || row?.status || '').toLowerCase()
    const available = row?.available === true || result === 'available'
    const premium = isPremiumDomainRow(row)
    availabilityMap.set(domain, {
      available,
      premium,
      result,
      message: String(row?.message || row?.reason || result || ''),
    })
  }

  let selectedDomain: string | null = null
  const availableDomains: string[] = []
  const premiumAvailableDomains: string[] = []
  for (const d of candidates) {
    const key = String(d).toLowerCase()
    const info = availabilityMap.get(key)
    if (!info?.available) continue
    if (info.premium) {
      premiumAvailableDomains.push(d)
      continue
    }
    availableDomains.push(d)
  }

  if (availableDomains.length) {
    if (forceBool && currentDomain) {
      const different = availableDomains.find((d) => String(d).toLowerCase() !== currentDomain)
      selectedDomain = different || availableDomains[0] || null
    } else {
      selectedDomain = availableDomains[0] || null
    }
  }

  let status = 'unavailable'
  let availableFlag = false
  let message = `Checked ${candidates.length} domains; no standard-price domain available. Existing site_domain kept unchanged.`

  if (resp.error) {
    status = 'error'
    availableFlag = false
    message = String(resp.error?.message || resp.message || 'Spaceship request failed').slice(0, 1000)
  } else if (selectedDomain) {
    status = 'available'
    availableFlag = true
    if (forceBool) {
      if (currentDomain && String(selectedDomain).toLowerCase() === currentDomain) {
        message = `Force enabled; only current domain available in standard list. Kept: ${selectedDomain}`
      } else if (currentDomain) {
        message = `Force enabled; replaced ${currentDomainRaw} with ${selectedDomain} (standard available: ${availableDomains.length}).`
      } else {
        message = `Force enabled; selected ${selectedDomain} from ${availableDomains.length} standard available domain(s).`
      }
    } else if (currentDomain) {
      message = `Found ${availableDomains.length} standard available domain(s). Force disabled; kept existing domain ${currentDomainRaw}. Top candidate: ${selectedDomain}`
    } else {
      message = `Found ${availableDomains.length} standard available domain(s). Selected: ${selectedDomain}`
    }
    if (premiumAvailableDomains.length) {
      message += ` Ignored ${premiumAvailableDomains.length} premium domain(s).`
    }
  } else if (premiumAvailableDomains.length) {
    status = 'unavailable'
    availableFlag = false
    message = `Only premium domains are available (${premiumAvailableDomains.length}); existing site_domain kept unchanged.`
  }

  const appliedDomain = forceBool
    ? selectedDomain || currentDomainRaw || null
    : currentDomainRaw || selectedDomain || null

  const stamp = now.replace('T', ' ').replace('Z', ' UTC')
  const logLines = [
    `[${stamp}] [AI-Domain] force=${forceBool}; audience=${selectedAudience || '-'}; status=${status}; current=${currentDomainRaw || '-'}; selected=${selectedDomain || '-'}; applied=${appliedDomain || '-'}; standard_available=${availableDomains.length}/${candidates.length}; premium_available=${premiumAvailableDomains.length}`,
    `[AI-Domain] selected_audience=${selectedAudience || '-'}`,
    `[AI-Domain] audience_candidates=${audienceCandidates.join(' | ') || '-'}`,
    `[AI-Domain] candidates=${candidates.join(', ') || '-'}`,
    `[AI-Domain] available_domains=${availableDomains.join(', ') || '-'}`,
    `[AI-Domain] premium_available_domains=${premiumAvailableDomains.join(', ') || '-'}`,
    `[AI-Domain] availability_rows=${JSON.stringify(resultRows).slice(0, 4000)}`,
    `[AI-Domain] message=${String(message).slice(0, 500)}`,
  ]
  const newLogEntry = logLines.join('\n')
  const mergedLog = mergeDomainLog(input.currentLog, newLogEntry)

  let nextNicheData: Record<string, unknown> = {}
  if (nicheIn && typeof nicheIn === 'object' && !Array.isArray(nicheIn)) {
    nextNicheData = { ...nicheIn }
  }
  delete nextNicheData.target_audience_candidates
  delete nextNicheData.target_audience_updated_at
  delete nextNicheData.domain_suggestions
  delete nextNicheData.domain_availability
  delete nextNicheData.domain_selected
  delete nextNicheData.domain_generation_at
  if (selectedAudience) {
    nextNicheData.target_audience = selectedAudience
  }

  const patch: SiteDomainGenerationPatch = {
    domainCheckStatus: status,
    domainCheckAvailable: status === 'error' ? false : availableFlag,
    domainCheckAt: now,
    domainCheckMessage: String(message).slice(0, 1000),
    domainGenerationLog: mergedLog,
    nicheData: nextNicheData,
    domainWorkflowStatus: status === 'error' ? 'error' : 'done',
  }

  let nextPrimary: string | undefined
  if (selectedDomain) {
    if (forceBool) {
      nextPrimary = selectedDomain
    } else if (!currentDomainRaw.trim()) {
      nextPrimary = selectedDomain
    }
  }
  if (nextPrimary) {
    patch.primaryDomain = nextPrimary
    patch.slug = domainToSlug(nextPrimary)
  }

  const effectiveDomain = String(
    patch.primaryDomain || appliedDomain || currentDomainRaw || '',
  ).trim()

  if (effectiveDomain && effectiveDomain !== PLACEHOLDER_DOMAIN) {
    const normalized = normalizeDomain(effectiveDomain)
    const mapped = normalized ? siteNameMap[normalized] : ''
    const siteName = mapped || domainToSiteName(effectiveDomain)
    if (siteName) {
      patch.name = siteName
    }
  }

  return {
    patch,
    detail: {
      site_id: siteId,
      force: forceBool,
      current_domain: currentDomainRaw || null,
      applied_domain: appliedDomain,
      selected_audience: selectedAudience || null,
      audience_candidates: audienceCandidates,
      selected_domain: selectedDomain,
      available_domains: availableDomains,
      premium_available_domains: premiumAvailableDomains,
      checked_domains: candidates,
      status,
      message,
    },
  }
}
