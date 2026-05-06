import { parseCsvRows, stripBom } from '@/utilities/csv'

/** Canonical keys aligned with `affiliate-earnings-rows` payload fields (camelCase without nesting). */
export type AmazonAssociatesCanonicalHeader =
  | 'trackingId'
  | 'clicks'
  | 'itemsOrdered'
  | 'orderedRevenueUsd'
  | 'itemsShipped'
  | 'itemsReturned'
  | 'shippedRevenueUsd'
  | 'returnedRevenueUsd'
  | 'totalEarningsUsd'
  | 'bonusUsd'
  | 'shippedEarningsUsd'
  | 'returnedEarningsUsd'

/** Parsed numeric row ready for Payload create (excluding batch/recipient/period). */
export type AmazonAssociatesDataRow = {
  trackingId: string
  clicks: number
  itemsOrdered: number
  orderedRevenueUsd: number | null
  itemsShipped: number
  itemsReturned: number
  shippedRevenueUsd: number | null
  returnedRevenueUsd: number | null
  totalEarningsUsd: number | null
  bonusUsd: number | null
  shippedEarningsUsd: number | null
  returnedEarningsUsd: number | null
  rawCells: Record<string, string>
}

function normalizeHeaderCell(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Map Amazon Associates report header (incl. truncated Excel columns) to a canonical field.
 */
export function normalizeAmazonAssociatesHeader(header: string): AmazonAssociatesCanonicalHeader | null {
  const n = normalizeHeaderCell(header)
  if (!n) return null

  const pairs: Array<{ prefixes: string[]; key: AmazonAssociatesCanonicalHeader }> = [
    { prefixes: ['tracking id'], key: 'trackingId' },
    { prefixes: ['clicks'], key: 'clicks' },
    { prefixes: ['items ordered'], key: 'itemsOrdered' },
    { prefixes: ['ordered revenue'], key: 'orderedRevenueUsd' },
    { prefixes: ['items shipped earnings'], key: 'shippedEarningsUsd' },
    { prefixes: ['items shipped revenue', 'items shipped re'], key: 'shippedRevenueUsd' },
    { prefixes: ['items shipped'], key: 'itemsShipped' },
    { prefixes: ['items returned earnings'], key: 'returnedEarningsUsd' },
    { prefixes: ['items returned revenue', 'items returned r'], key: 'returnedRevenueUsd' },
    { prefixes: ['items returned'], key: 'itemsReturned' },
    { prefixes: ['total earnings'], key: 'totalEarningsUsd' },
    { prefixes: ['bonus'], key: 'bonusUsd' },
  ]

  let best: { len: number; key: AmazonAssociatesCanonicalHeader } | null = null
  for (const { prefixes, key } of pairs) {
    for (const p of prefixes) {
      if (n === p || n.startsWith(p)) {
        if (!best || p.length > best.len) best = { len: p.length, key }
      }
    }
  }
  return best?.key ?? null
}

function splitLinesPreserving(content: string): string[] {
  return stripBom(content).split(/\r?\n/)
}

/** Split rows by tab; trims trailing carriage returns from cells. */
export function parseTsvRows(content: string): string[][] {
  const lines = splitLinesPreserving(content)
  const rows: string[][] = []
  for (const line of lines) {
    if (line === '') continue
    rows.push(line.split('\t').map((c) => c.replace(/\r$/, '').trim()))
  }
  return rows
}

/**
 * Detect delimiter from first non-empty line: tab-heavy vs comma CSV (RFC4180 via parseCsvRows).
 */
export function parseSpreadsheetRows(content: string): string[][] {
  const text = stripBom(content)
  const firstNl = text.search(/\r?\n/)
  const firstLine = firstNl === -1 ? text : text.slice(0, firstNl)
  const tabCount = (firstLine.match(/\t/g) ?? []).length
  const commaCount = (firstLine.match(/,/g) ?? []).length
  if (tabCount > 0 && tabCount >= commaCount) {
    return parseTsvRows(text)
  }
  return parseCsvRows(text)
}

export function parseMoneyCell(raw: string): number | null {
  const s = raw.trim().replace(/,/g, '').replace(/\$/g, '').replace(/\s+/g, '')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function parseIntCell(raw: string): number | null {
  const s = raw.trim().replace(/,/g, '').replace(/\s+/g, '')
  if (s === '') return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

export type AmazonAssociatesParseResult =
  | {
      ok: true
      headerIndexes: Map<AmazonAssociatesCanonicalHeader, number>
      rows: AmazonAssociatesDataRow[]
    }
  | { ok: false; errors: string[] }

const REQUIRED_HEADERS: AmazonAssociatesCanonicalHeader[] = [
  'trackingId',
  'clicks',
  'itemsOrdered',
  'orderedRevenueUsd',
  'itemsShipped',
  'itemsReturned',
  'shippedRevenueUsd',
  'returnedRevenueUsd',
  'totalEarningsUsd',
  'bonusUsd',
  'shippedEarningsUsd',
  'returnedEarningsUsd',
]

/**
 * Parse full Associates export text into data rows; returns errors for missing columns, bad cells, or duplicate Tracking Id.
 */
export function parseAmazonAssociatesReport(text: string): AmazonAssociatesParseResult {
  const matrix = parseSpreadsheetRows(text)
  const nonEmpty = matrix.filter((r) => r.some((c) => c.trim() !== ''))
  if (nonEmpty.length < 2) {
    return { ok: false, errors: ['报表至少需要表头与一行数据。'] }
  }

  const headerRow = nonEmpty[0]!.map((h) => h.trim())
  const headerIndexes = new Map<AmazonAssociatesCanonicalHeader, number>()
  for (let i = 0; i < headerRow.length; i++) {
    const key = normalizeAmazonAssociatesHeader(headerRow[i]!)
    if (!key) continue
    if (!headerIndexes.has(key)) headerIndexes.set(key, i)
  }

  const missing = REQUIRED_HEADERS.filter((h) => !headerIndexes.has(h))
  if (missing.length > 0) {
    return {
      ok: false,
      errors: [`缺少必填列：${missing.join(', ')}`],
    }
  }

  const dataLines = nonEmpty.slice(1)
  const rows: AmazonAssociatesDataRow[] = []
  const errors: string[] = []
  const seenTracking = new Set<string>()

  for (let li = 0; li < dataLines.length; li++) {
    const lineNum = li + 2
    const row = dataLines[li]!
    while (row.length < headerRow.length) row.push('')

    const cell = (key: AmazonAssociatesCanonicalHeader): string => {
      const idx = headerIndexes.get(key)!
      return row[idx] ?? ''
    }

    const trackingRaw = cell('trackingId').trim()
    if (!trackingRaw) {
      errors.push(`第 ${lineNum} 行：Tracking Id 为空`)
      continue
    }
    const tidLower = trackingRaw.toLowerCase()
    if (seenTracking.has(tidLower)) {
      errors.push(`第 ${lineNum} 行：重复的 Tracking Id「${trackingRaw}」（请合并后再导入）`)
      continue
    }
    seenTracking.add(tidLower)

    const clicks = parseIntCell(cell('clicks'))
    const itemsOrdered = parseIntCell(cell('itemsOrdered'))
    const itemsShipped = parseIntCell(cell('itemsShipped'))
    const itemsReturned = parseIntCell(cell('itemsReturned'))
    if (clicks == null || itemsOrdered == null || itemsShipped == null || itemsReturned == null) {
      errors.push(`第 ${lineNum} 行：整数列格式无效`)
      continue
    }

    const orderedRevenueUsd = parseMoneyCell(cell('orderedRevenueUsd'))
    const shippedRevenueUsd = parseMoneyCell(cell('shippedRevenueUsd'))
    const returnedRevenueUsd = parseMoneyCell(cell('returnedRevenueUsd'))
    const totalEarningsUsd = parseMoneyCell(cell('totalEarningsUsd'))
    const bonusUsd = parseMoneyCell(cell('bonusUsd'))
    const shippedEarningsUsd = parseMoneyCell(cell('shippedEarningsUsd'))
    const returnedEarningsUsd = parseMoneyCell(cell('returnedEarningsUsd'))

    const checkMoney = (label: string, val: number | null, rawStr: string) => {
      if (rawStr.trim() !== '' && val == null) errors.push(`第 ${lineNum} 行：${label} 金额格式无效`)
    }
    checkMoney('Ordered Revenue', orderedRevenueUsd, cell('orderedRevenueUsd'))
    checkMoney('Shipped Revenue', shippedRevenueUsd, cell('shippedRevenueUsd'))
    checkMoney('Returned Revenue', returnedRevenueUsd, cell('returnedRevenueUsd'))
    checkMoney('Total Earnings', totalEarningsUsd, cell('totalEarningsUsd'))
    checkMoney('Bonus', bonusUsd, cell('bonusUsd'))
    checkMoney('Shipped Earnings', shippedEarningsUsd, cell('shippedEarningsUsd'))
    checkMoney('Returned Earnings', returnedEarningsUsd, cell('returnedEarningsUsd'))

    const rawCells: Record<string, string> = {}
    for (let j = 0; j < headerRow.length; j++) {
      rawCells[headerRow[j] ?? `col${j}`] = row[j] ?? ''
    }

    rows.push({
      trackingId: trackingRaw,
      clicks,
      itemsOrdered,
      orderedRevenueUsd,
      itemsShipped,
      itemsReturned,
      shippedRevenueUsd,
      returnedRevenueUsd,
      totalEarningsUsd,
      bonusUsd,
      shippedEarningsUsd,
      returnedEarningsUsd,
      rawCells,
    })
  }

  if (errors.length > 0) return { ok: false, errors }

  return { ok: true, headerIndexes, rows }
}
