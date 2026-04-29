import type { Payload } from 'payload'

export type GateInputRow = {
  id: string | number
  site_id: number
  main_product: string
  force: boolean
  site_name: string
  target_audience: string
}

export type ReadyGateRow = {
  id: string | number
  site_id: number | null
  main_product: string
  site_name: string
  target_audience: string
  short_main_product: string
  categories: string[]
  skipped: boolean
  skip_reason?: string
}

async function loadExistingCategoryNames(
  payload: Payload,
  siteId: number,
): Promise<string[]> {
  const r = await payload.find({
    collection: 'categories',
    where: { site: { equals: siteId } },
    sort: 'createdAt',
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  return r.docs
    .map((d) => String((d as { name?: string }).name ?? '').trim())
    .filter(Boolean)
}

/**
 * Any existing category name on site + !force → skip AI (n8n gate).
 */
export async function gateByForceAndExisting(
  payload: Payload,
  sourceRows: GateInputRow[],
): Promise<{
  ready_rows: ReadyGateRow[]
  to_generate_rows: GateInputRow[]
}> {
  const readyRows: ReadyGateRow[] = []
  const toGenerateRows: GateInputRow[] = []

  for (const row of sourceRows) {
    const siteId = row.site_id
    const existingNames = await loadExistingCategoryNames(payload, siteId)
    const hasExisting = existingNames.length > 0
    const force = !!row.force

    if (hasExisting && !force) {
      readyRows.push({
        id: row.id,
        site_id: siteId,
        main_product: row.main_product,
        site_name: row.site_name || '',
        target_audience: row.target_audience || '',
        short_main_product: existingNames[0] || row.main_product,
        categories: existingNames.slice(0, 5),
        skipped: true,
        skip_reason: 'existing_categories_present_and_force_false',
      })
    } else {
      toGenerateRows.push(row)
    }
  }

  return { ready_rows: readyRows, to_generate_rows: toGenerateRows }
}
