/** n8n Build Audience Prompt / Build Prompt 等价文案（常量，不引用外部不可信内容）。 */

export function buildAudiencePrompts(input: {
  mainProduct: string
  siteName: string
  niche: string
  currentAudience: string
}): { system: string; user: string } {
  const { mainProduct, siteName, niche, currentAudience } = input
  const baseTopic = (mainProduct || siteName || niche).trim()
  if (!baseTopic) {
    throw new Error('main_product/site_name/niche are all empty')
  }

  const system = [
    'You are a market researcher for niche content websites.',
    'Generate exactly 5 distinct target audiences for the niche/product.',
    'Each audience should be specific, practical, and commercially relevant.',
    'Output strict JSON only: {"audiences":["..."]}',
    'Rules:',
    '1) Exactly 5 items',
    '2) All items must be unique',
    '3) Each item <= 12 words',
    '4) English only',
  ].join('\n')

  const user = [
    `main_product: ${mainProduct || '(empty)'}`,
    `site_name: ${siteName || '(empty)'}`,
    `niche: ${niche || '(empty)'}`,
    `existing_target_audience: ${currentAudience || '(empty)'}`,
    '',
    'Task: Provide 5 target audience options for domain naming strategy.',
    'Return JSON only.',
  ].join('\n')

  return { system, user }
}

export function buildDomainNamingPrompts(input: {
  mainProduct: string
  siteName: string
  niche: string
  selectedAudience: string
  audienceCandidates: string[]
  currentPrimaryDomain: string
}): { system: string; user: string } {
  const {
    mainProduct,
    siteName,
    niche,
    selectedAudience,
    audienceCandidates,
    currentPrimaryDomain,
  } = input

  const baseTopic = (mainProduct || siteName || niche).trim()
  if (!baseTopic) {
    throw new Error('main_product/site_name/niche are all empty')
  }

  const system = [
    'You are a senior domain naming strategist for content/affiliate websites.',
    'Generate niche-relevant, trustworthy, professional domains aligned with E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness).',
    'Output strictly JSON only: {"items":[{"domain":"BestCoffeeHub.com","site_name":"Best Coffee Hub"}]}',
    'Hard rules:',
    '1) .com ONLY (no other TLDs).',
    '2) Exactly 20 unique items.',
    '3) domain must use English letters only (a-z/A-Z) in second-level name; no hyphens, no numbers, no special characters, no spaces.',
    '4) Use PascalCase in domain for readability (e.g., BestCoffeeHub.com).',
    '5) site_name must be the domain split into words with spaces, and each word must be Title Case (e.g., Best Coffee Hub).',
    '6) site_name must correspond to the returned domain words.',
    '7) Prioritize clarity, credibility, and topical relevance to the niche/main product.',
    '8) Avoid trademark-heavy or famous brand terms.',
    '9) Tailor naming tone to the chosen target audience.',
    '10) English-only words and ASCII letters only; do not use Chinese, Japanese, Korean, accented characters, or transliteration.',
    "11) Forbidden token in domain: the exact word 'domain' must not appear anywhere in second-level domain.",
    '12) Return strict JSON only.',
  ].join('\n')

  const user = [
    `main_product: ${mainProduct || '(empty)'}`,
    `site_name: ${siteName || '(empty)'}`,
    `niche: ${niche || '(empty)'}`,
    `selected_target_audience: ${selectedAudience || '(empty)'}`,
    `audience_candidates: ${audienceCandidates.length ? audienceCandidates.join(' | ') : '(empty)'}`,
    `current_site_domain: ${currentPrimaryDomain || '(empty)'}`,
    '',
    'Task:',
    'Generate 20 brandable domain candidates for this niche and selected target audience.',
    'For each candidate, return domain (PascalCase .com) and site_name (same words with spaces, each word Title Case).',
    'Return JSON only.',
  ].join('\n')

  return { system, user }
}
