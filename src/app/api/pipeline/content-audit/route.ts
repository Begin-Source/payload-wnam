import { isPipelineUnauthorized, requirePipelineJson } from '@/app/api/pipeline/lib/auth'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { lexicalArticleBodyToPlainText } from '@/services/writing/lexicalBodyPlain'
import { applyAuditorVetoTable, HARD_VETO_CODES, listContainsHardVeto } from '@/utilities/eeatScoring'
import { scorePublishReadyPlainText } from '@/utilities/articleMarkdownPublishHeuristic'
import {
  auditOnPageSeoFormat,
  onPageSeoFormatRequirements,
} from '@/utilities/onPageSeoFormatAudit'
import { normalizeGlobalPipelineDoc } from '@/utilities/pipelineSettingShape'
import { resolvePipelineConfigForArticle, type ResolvedPipelineConfig } from '@/utilities/resolvePipelineConfig'
import { d1NarrowUpdate } from '@/utilities/d1NarrowUpdate'

export const dynamic = 'force-dynamic'
const PATH = '/api/pipeline/content-audit'

type AuditBody = {
  articleId?: string | number
  rawScore?: number
  vetoes?: string[]
  publishIfPass?: boolean
}

function numId(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.floor(raw)
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) return Number(raw.trim())
  return null
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
}

function qualityGate(articleStrategy: unknown): {
  minOverallScore: number
  hardVetoCodes: string[]
  publishIfPass: boolean
} {
  const root = asRecord(articleStrategy)
  const gate = root ? asRecord(root.contentQualityGate) : null
  const sw = root ? asRecord(root.seoWorkflow) : null
  const minFromGate = gate?.minOverallScore
  const minFromWorkflow = sw?.minQualityScore
  const minRaw =
    typeof minFromGate === 'number' ? minFromGate
    : typeof minFromWorkflow === 'number' ? minFromWorkflow
    : 80
  const hardRaw = gate?.hardVetoCodes ?? sw?.hardVetoCodes
  const hardVetoCodes =
    Array.isArray(hardRaw) ?
      hardRaw.map((v) => String(v).trim()).filter(Boolean)
    : [...HARD_VETO_CODES]
  return {
    minOverallScore: Number.isFinite(minRaw) ? Math.max(0, Math.min(100, Math.floor(minRaw))) : 80,
    hardVetoCodes,
    publishIfPass: gate?.publishIfPass === true,
  }
}

function hasDisclosure(text: string): boolean {
  return /affiliate|commission|disclosure|we may earn|partner links/i.test(text) ||
    /联盟|推广链接|声明|佣金/i.test(text)
}

function hasRelationItems(raw: unknown): boolean {
  return Array.isArray(raw) && raw.length > 0
}

function hasRelationValue(raw: unknown): boolean {
  if (raw == null) return false
  if (typeof raw === 'number') return Number.isFinite(raw)
  if (typeof raw === 'string') return raw.trim().length > 0
  if (typeof raw === 'object' && 'id' in raw) return hasRelationValue((raw as { id?: unknown }).id)
  return false
}

function jsonColumnValue(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function inferVetoes(article: Record<string, unknown>, plain: string, supplied: unknown): string[] {
  const out = new Set<string>()
  if (Array.isArray(supplied)) {
    for (const v of supplied) {
      if (typeof v === 'string' && v.trim()) out.add(v.trim())
    }
  }
  const affiliateSurface =
    hasRelationItems(article.relatedOffers) ||
    hasRelationItems(article.featuredOffers) ||
    /amazon\.[a-z.]+|amzn\.to|\/dp\/[A-Z0-9]{8,}/i.test(plain)
  if (affiliateSurface && !hasDisclosure(plain)) out.add('T04')
  return Array.from(out)
}

/** Lightweight runtime audit gate. Full 80-item CORE-EEAT remains the editorial skill audit. */
export async function POST(request: Request): Promise<Response> {
  const g = requirePipelineJson(request, PATH)
  if (isPipelineUnauthorized(g)) {
    return g.response
  }
  const body = (await request.json().catch(() => ({}))) as AuditBody
  const articleId = numId(body.articleId)
  if (articleId == null) {
    return Response.json({ error: 'articleId required' }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })
  const article = (await payload.findByID({
    collection: 'articles',
    id: String(articleId),
    depth: 0,
    overrideAccess: true,
  })) as Record<string, unknown> | null
  if (!article) {
    return Response.json({ error: 'article not found' }, { status: 404 })
  }

  const cfg = await resolvePipelineConfigForArticle(payload, articleId, null)
  const resolved =
    'ok' in cfg && cfg.ok === false ?
      {
        merged: normalizeGlobalPipelineDoc(
          (await payload.findGlobal({ slug: 'pipeline-settings', depth: 0 })) as Record<string, unknown>,
        ),
        profileSlug: '',
        source: 'global_only',
      }
    : (cfg as ResolvedPipelineConfig)

  const plain = lexicalArticleBodyToPlainText(article.body).trim()
  const onPageRequirements = onPageSeoFormatRequirements(resolved.merged.articleStrategy)
  const onPageAudit = auditOnPageSeoFormat(article.body, onPageRequirements)
  const baseRawScore =
    typeof body.rawScore === 'number' && Number.isFinite(body.rawScore) ?
      Math.max(0, Math.min(100, Math.floor(body.rawScore)))
    : Math.max(scorePublishReadyPlainText(plain), onPageAudit.score)
  const rawScore =
    onPageRequirements && onPageAudit.missing.length > 0 ?
      Math.min(baseRawScore, 79)
    : baseRawScore
  const vetoes = inferVetoes(article, plain, body.vetoes)
  const gate = qualityGate(resolved.merged.articleStrategy)
  const hardVetoes = vetoes.filter((v) => gate.hardVetoCodes.includes(v))
  const { capApplied, finalOverallScore, blocked } = applyAuditorVetoTable({
    rawOverallScore: rawScore,
    vetoCount: vetoes.length,
  })
  const hardBlocked = hardVetoes.length > 0 || listContainsHardVeto(vetoes)
  const publishRequested = body.publishIfPass === true || gate.publishIfPass
  const missingAuthorForPublish = publishRequested && !hasRelationValue(article.author)
  const passes =
    finalOverallScore >= gate.minOverallScore &&
    !blocked &&
    !hardBlocked &&
    !missingAuthorForPublish
  const verdict = passes ? 'SHIP' : hardBlocked ? 'BLOCK' : 'FIX'

  const eeatCheck = {
    auditorVersion: 'runtime-heuristic-v1',
    auditedAt: new Date().toISOString(),
    contentType: typeof article.contentTemplate === 'string' ? article.contentTemplate : 'article',
    rawOverallScore: rawScore,
    finalOverallScore,
    threshold: gate.minOverallScore,
    verdict,
    capApplied,
    vetoIds: vetoes,
    hardVetoIds: hardVetoes,
    pipelineProfileSlug: resolved.profileSlug ?? '',
    pipelineProfileSource: resolved.source ?? 'global_only',
    evidenceSummary: {
      words: plain ? plain.split(/\s+/).filter(Boolean).length : 0,
      disclosurePresent: hasDisclosure(plain),
      affiliateSurface:
        hasRelationItems(article.relatedOffers) ||
        hasRelationItems(article.featuredOffers) ||
        /amazon\.[a-z.]+|amzn\.to|\/dp\/[A-Z0-9]{8,}/i.test(plain),
      onPageSeo: onPageAudit.metrics,
      onPageSeoRequirements: onPageAudit.requirements,
      onPageSeoMissing: onPageAudit.missing,
      authorPresent: hasRelationValue(article.author),
    },
    topFixes:
      passes ? []
      : [
          ...onPageAudit.missing,
          missingAuthorForPublish ? 'Assign an author before publishing.' : '',
          finalOverallScore < gate.minOverallScore ?
            `Raise article qualityScore to at least ${gate.minOverallScore}.`
          : '',
          hardVetoes.includes('T04') ? 'Add a clear affiliate disclosure near the top of the article.' : '',
          hardVetoes.includes('C01') ? 'Align title/H2 promises with the actual article body.' : '',
          hardVetoes.includes('R10') ? 'Resolve conflicting data points before publishing.' : '',
        ].filter(Boolean),
  }

  const updateData: Record<string, unknown> = {
    qualityScore: finalOverallScore,
    eeatCheck,
    vetoCodes: vetoes,
  }
  if (publishRequested && passes) {
    updateData.status = 'published'
    updateData._quality = { rawScore, vetoes }
  }

  try {
    await payload.update({
      collection: 'articles',
      id: String(articleId),
      data: updateData,
      overrideAccess: true,
    })
  } catch (e) {
    const narrowPairs: Array<[string, unknown]> = [
      ['quality_score', finalOverallScore],
      ['eeat_check', jsonColumnValue(eeatCheck)],
      ['veto_codes', jsonColumnValue(vetoes)],
    ]
    if (updateData.status === 'published') narrowPairs.push(['status', 'published'])
    const narrowOk = await d1NarrowUpdate(payload, 'articles', articleId, narrowPairs)
    if (!narrowOk) throw e
  }

  return Response.json({
    ok: true,
    articleId,
    rawOverallScore: rawScore,
    finalOverallScore,
    threshold: gate.minOverallScore,
    verdict,
    capApplied,
    vetoIds: vetoes,
    hardVetoIds: hardVetoes,
    handoff: {
      status: verdict,
      objective: 'Runtime article quality audit gate',
      recommendedNextSkill: passes ? 'performance-reporter' : 'content-refresher',
      scores: { rawOverallScore: rawScore, finalOverallScore, threshold: gate.minOverallScore },
      capApplied,
      keyFindings:
        passes ?
          'Article met the runtime 80+ quality gate.'
        : `Article did not meet the runtime quality gate (${finalOverallScore}/${gate.minOverallScore}).`,
    },
  })
}
