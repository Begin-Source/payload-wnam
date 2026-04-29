import type { GateInputRow } from './gate'

type NormalizedCandidate = { niche: string; related: string[]; accessory: string[] }

function normalizeLabel(text: string): string {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeName(item: unknown): string {
  if (typeof item === 'string') return normalizeLabel(item)
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>
    return normalizeLabel(
      String(o.name ?? o.product ?? o.value ?? ''),
    )
  }
  return ''
}

function uniqueList(items: unknown[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of Array.isArray(items) ? items : []) {
    const name = normalizeName(raw)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

function normalizeCandidate(candidate: Record<string, unknown>): NormalizedCandidate {
  const niche = normalizeLabel(
    String(candidate?.niche_product ?? candidate?.short_name ?? ''),
  )

  const relatedRaw = Array.isArray(candidate?.related_products)
    ? candidate.related_products
    : Array.isArray(candidate?.support_products)
      ? candidate.support_products
      : []

  const accessoryRaw = Array.isArray(candidate?.accessory_fallback_products)
    ? candidate.accessory_fallback_products
    : Array.isArray(candidate?.accessory_products)
      ? candidate.accessory_products
      : []

  const related = uniqueList(relatedRaw)
    .filter((name) => name.toLowerCase() !== niche.toLowerCase())
    .slice(0, 5)

  const relatedSet = new Set(related.map((name) => name.toLowerCase()))
  const accessory = uniqueList(accessoryRaw)
    .filter(
      (name) =>
        name.toLowerCase() !== niche.toLowerCase() && !relatedSet.has(name.toLowerCase()),
    )
    .slice(0, 5)

  return { niche, related, accessory }
}

function stripFences(content: string): string {
  return content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

/** Parse OpenRouter / LLM JSON output and merge candidates back into original rows (n8n "Parse AI Shortname"). */
export function parseAiShortnameResponse(
  originalRows: GateInputRow[],
  llmJson: unknown,
): Array<
  GateInputRow & {
    short_main_product: string
    scenario_related_products: string[]
    scenario_accessory_products: string[]
    scenario_support_products: string[]
    ai_candidates_count: number
    ai_selected_index: number
  }
> {
  let parsedRows: unknown[] = []

  if (llmJson && typeof llmJson === 'object') {
    const o = llmJson as Record<string, unknown>
    if (Array.isArray(o.rows)) parsedRows = o.rows
    else if (o.data && typeof o.data === 'object' && Array.isArray((o.data as { rows?: unknown[] }).rows)) {
      parsedRows = (o.data as { rows: unknown[] }).rows
    }
  }

  if (!parsedRows.length && llmJson && typeof llmJson === 'object') {
    const o = llmJson as Record<string, unknown>
    const rawContent =
      (Array.isArray(o.choices) ? (o.choices[0] as { message?: { content?: unknown } })?.message?.content : undefined) ??
      o.text ??
      o.output ??
      (o.response as { text?: unknown } | undefined)?.text ??
      o.message ??
      ''

    let content = ''
    if (typeof rawContent === 'string') {
      content = rawContent.trim()
    } else if (rawContent && typeof rawContent === 'object') {
      const rc = rawContent as Record<string, unknown>
      if (Array.isArray(rc.rows)) {
        parsedRows = rc.rows as unknown[]
      } else {
        content = JSON.stringify(rawContent)
      }
    }

    if (!parsedRows.length && content) {
      try {
        const clean = stripFences(content)
        if (clean) {
          const parsed = JSON.parse(clean) as { rows?: unknown[] }
          if (Array.isArray(parsed?.rows)) parsedRows = parsed.rows
        }
      } catch {
        parsedRows = []
      }
    }
  }

  const byId = new Map(
    parsedRows
      .map((row) => {
        const r = row as Record<string, unknown>
        const id = String(r?.id ?? '')
        let candidates: NormalizedCandidate[] = []

        if (Array.isArray(r?.candidates)) {
          candidates = (r.candidates as Record<string, unknown>[])
            .map((c) => normalizeCandidate(c))
            .filter((c) => c.niche || c.related.length || c.accessory.length)
        }

        if (!candidates.length) {
          const legacy = normalizeCandidate({
            niche_product: r?.niche_product ?? r?.short_name ?? '',
            related_products: r?.related_products ?? r?.support_products ?? [],
            accessory_fallback_products:
              r?.accessory_fallback_products ?? r?.accessory_products ?? [],
          })
          if (legacy.niche || legacy.related.length || legacy.accessory.length) {
            candidates = [legacy]
          }
        }

        return [id, candidates] as const
      })
      .filter(([id]) => id),
  )

  return originalRows.map((row) => {
    const id = String(row?.id ?? '')
    const candidates = byId.get(id) || []

    let selected: NormalizedCandidate = { niche: '', related: [], accessory: [] }
    let selectedIndex = -1

    if (candidates.length) {
      selectedIndex = Math.floor(Math.random() * candidates.length)
      selected = candidates[selectedIndex] ?? selected
    }

    return {
      ...row,
      short_main_product: selected.niche,
      scenario_related_products: selected.related,
      scenario_accessory_products: selected.accessory,
      scenario_support_products: [...selected.related, ...selected.accessory],
      ai_candidates_count: candidates.length,
      ai_selected_index: selectedIndex,
    }
  })
}
