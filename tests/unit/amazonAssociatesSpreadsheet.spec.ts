import { describe, expect, it } from 'vitest'

import {
  normalizeAmazonAssociatesHeader,
  parseAmazonAssociatesReport,
  parseSpreadsheetRows,
  parseMoneyCell,
} from '@/utilities/amazonAssociatesSpreadsheet'

const FULL_HEADERS =
  'Tracking Id\tClicks\tItems Ordered\tOrdered Revenue\tItems Shipped\tItems Returned\tItems Shipped Revenue\tItems Returned Revenue\tTotal Earnings\tBonus\tItems Shipped Earnings\tItems Returned Earnings'

const SAMPLE_ROW_TAB = 'others\t8\t1\t17.09\t1\t0\t17.09\t0\t0.17\t0\t0.17\t0'

describe('normalizeAmazonAssociatesHeader', () => {
  it('maps full Amazon headers', () => {
    expect(normalizeAmazonAssociatesHeader('Tracking Id')).toBe('trackingId')
    expect(normalizeAmazonAssociatesHeader('Items Shipped Revenue')).toBe('shippedRevenueUsd')
    expect(normalizeAmazonAssociatesHeader('Items Shipped Re')).toBe('shippedRevenueUsd')
    expect(normalizeAmazonAssociatesHeader('Items Returned R')).toBe('returnedRevenueUsd')
    expect(normalizeAmazonAssociatesHeader('Items Shipped Earnings')).toBe('shippedEarningsUsd')
  })
})

describe('parseSpreadsheetRows', () => {
  it('parses tab-separated sample', () => {
    const text = `${FULL_HEADERS}\n${SAMPLE_ROW_TAB}`
    const rows = parseSpreadsheetRows(text)
    expect(rows.length).toBe(2)
    expect(rows[0]![0]).toBe('Tracking Id')
    expect(rows[1]![0]).toBe('others')
    expect(rows[1]![8]).toBe('0.17')
  })

  it('parses comma-separated when no dominant tabs', () => {
    const text =
      'Tracking Id,Clicks,Items Ordered,Ordered Revenue,Items Shipped,Items Returned,Items Shipped Revenue,Items Returned Revenue,Total Earnings,Bonus,Items Shipped Earnings,Items Returned Earnings\n' +
      'others,8,1,17.09,1,0,17.09,0,0.17,0,0.17,0'
    const rows = parseSpreadsheetRows(text)
    expect(rows.length).toBe(2)
    expect(rows[1]![11]).toBe('0')
  })
})

describe('parseAmazonAssociatesReport', () => {
  it('parses TSV sample with gross totals', () => {
    const text = `${FULL_HEADERS}\n${SAMPLE_ROW_TAB}`
    const r = parseAmazonAssociatesReport(text)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.rows.length).toBe(1)
    const row = r.rows[0]!
    expect(row.trackingId).toBe('others')
    expect(row.clicks).toBe(8)
    expect(row.totalEarningsUsd).toBe(0.17)
    expect(row.shippedEarningsUsd).toBe(0.17)
    expect(parseMoneyCell('')).toBeNull()
  })

  it('rejects duplicate Tracking Id', () => {
    const rowDup =
      'others\t8\t1\t17.09\t1\t0\t17.09\t0\t0.17\t0\t0.17\t0'
    const text = `${FULL_HEADERS}\n${rowDup}\n${rowDup}`
    const r = parseAmazonAssociatesReport(text)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.some((e) => e.includes('重复'))).toBe(true)
  })
})
