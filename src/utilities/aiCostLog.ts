import type { Payload } from 'payload'

import {
  resolveOpenRouterChargeUsd,
  resolveTogetherImageChargeUsd,
} from '@/utilities/aiCostPricing'

export type AiCostEntry = {
  provider: string
  model?: string | null
  kind: string
  usd: number
  at: string
  meta?: Record<string, unknown>
}

/**
 * Append one AI cost line and increment `aiCostUsd` on `articles`, `media`, or `sites`.
 */
export async function recordAiCost(args: {
  payload: Payload
  collection: 'articles' | 'media' | 'sites'
  id: number | string
  entry: AiCostEntry
}): Promise<void> {
  const { payload, collection, id } = args
  const usd = Number(args.entry.usd)
  if (!Number.isFinite(usd) || usd <= 0) return

  let doc: { id: number; aiCostUsd?: unknown; aiCostBreakdown?: unknown } | null = null
  try {
    doc = (await payload.findByID({
      collection,
      id,
      depth: 0,
      overrideAccess: true,
    })) as typeof doc
  } catch {
    return
  }
  if (!doc) return

  const current = Number(doc.aiCostUsd) || 0
  const nextTotal = current + usd

  const raw = doc.aiCostBreakdown
  const arr: unknown[] = Array.isArray(raw) ? [...raw] : []
  arr.push({
    provider: args.entry.provider,
    model: args.entry.model ?? null,
    kind: args.entry.kind,
    usd,
    at: args.entry.at,
    ...(args.entry.meta ? { meta: args.entry.meta } : {}),
  })
  const trimmed = arr.slice(-50)

  await payload.update({
    collection,
    id: doc.id,
    data: {
      aiCostUsd: nextTotal,
      aiCostBreakdown: trimmed,
    },
    overrideAccess: true,
  })
}

/** Resolve hybrid OpenRouter USD and append to ledger. */
export async function recordOpenRouterAiCost(args: {
  payload: Payload
  target: { collection: 'articles' | 'media' | 'sites'; id: number | string }
  model: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number }
  raw?: unknown
  kind: string
  metaExtra?: Record<string, unknown>
}): Promise<void> {
  const { usd, meta } = resolveOpenRouterChargeUsd({
    model: args.model,
    usage: args.usage,
    raw: args.raw,
    kind: args.kind,
  })
  await recordAiCost({
    payload: args.payload,
    collection: args.target.collection,
    id: args.target.id,
    entry: {
      provider: 'openrouter',
      model: args.model,
      kind: args.kind,
      usd,
      at: new Date().toISOString(),
      meta: { ...meta, ...(args.metaExtra ?? {}) },
    },
  })
}

/** Resolve Together image USD and append to ledger. */
export async function recordTogetherImageAiCost(args: {
  payload: Payload
  target: { collection: 'media' | 'sites'; id: number | string }
  raw?: unknown
  kind: string
  model?: string | null
}): Promise<void> {
  const { usd, meta } = resolveTogetherImageChargeUsd({ raw: args.raw, kind: args.kind })
  await recordAiCost({
    payload: args.payload,
    collection: args.target.collection,
    id: args.target.id,
    entry: {
      provider: 'together',
      model: args.model ?? null,
      kind: args.kind,
      usd,
      at: new Date().toISOString(),
      meta,
    },
  })
}
