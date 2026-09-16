import type { AmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import { amzConfigPatchSchema, amzConfigSchema, sanitizeAmzConfig, validateAmzConfig } from './configSchema'

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function deepMergeRecords(base: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    if (k === '__proto__' || k === 'prototype' || k === 'constructor') throw new Error('Unsupported config property')
    const prev = base[k]
    if (Array.isArray(v)) {
      base[k] = v
      continue
    }
    if (isPlainObject(v) && isPlainObject(prev)) {
      deepMergeRecords(prev, v)
      continue
    }
    base[k] = v
  }
}

/**
 * Deep-merge a partial JSON patch onto a full merged AMZ config (mutates a clone of base).
 */
export function mergePatchOntoAmzConfig(base: AmzSiteConfig, patch: unknown): AmzSiteConfig {
  const out = structuredClone(base) as unknown as Record<string, unknown>
  const validated = validateAmzConfig(amzConfigPatchSchema, patch)
  deepMergeRecords(out, validated as Record<string, unknown>)
  return validateAmzConfig(amzConfigSchema, out)
}

/**
 * Parse blueprint `amzSiteConfigJson` and merge onto bundled defaults (same shape as amz `siteConfig`).
 */
export function mergeAmzSiteConfigFromRaw(raw: unknown): AmzSiteConfig {
  let patch: unknown = {}
  if (typeof raw === 'string' && raw.length <= 120_000 && raw.trim()) {
    try {
      patch = JSON.parse(raw) as unknown
    } catch {
      patch = {}
    }
  } else if (isPlainObject(raw)) {
    patch = raw
  }
  return sanitizeAmzConfig(patch)
}
