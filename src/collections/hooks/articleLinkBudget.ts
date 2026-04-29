import type { CollectionBeforeValidateHook } from 'payload'

import { extractLinksFromLexical } from '@/services/linkgraph/ingest'

function countBodyOutlinks(body: unknown): number {
  if (!body) return 0
  return extractLinksFromLexical(body, { fromCollection: 'articles', fromId: '_', location: 'body' }).filter(
    (e) => e.toId || e.toExternal,
  ).length
}

/**
 * 内链补丁 M：正文出站链接数量软警告 / 硬上限（可用 `skipLinkBudgetCheck` 跳过）。
 */
export const articleLinkBudget: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  const merged = { ...originalDoc, ...data } as {
    body?: unknown
    skipLinkBudgetCheck?: boolean
    linkBudgetWarnings?: unknown
  }
  if (merged.skipLinkBudgetCheck) return data

  const n = countBodyOutlinks(merged.body)
  const next = { ...data } as Record<string, unknown>

  if (n > 150) {
    throw new Error(`正文出站链接过多（${n}，上限 150）。精简外链或在高级选项中勾选跳过出链预算校验。`)
  }

  if (n > 80) {
    const prev = merged.linkBudgetWarnings
    const list = Array.isArray(prev) ? [...prev] : []
    list.push({ code: 'outlink_budget_warn', count: n, at: new Date().toISOString() })
    next.linkBudgetWarnings = list
  }

  return next
}
