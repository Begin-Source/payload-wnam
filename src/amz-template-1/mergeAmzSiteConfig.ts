import type { AmzSiteConfig } from '@/amz-template-1/defaultSiteConfig'
import { defaultAmzSiteConfig } from '@/amz-template-1/defaultSiteConfig'

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function deepMergeRecords(base: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
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
  if (isPlainObject(patch)) {
    deepMergeRecords(out, patch)
  }
  return out as AmzSiteConfig
}

/**
 * Parse blueprint `amzSiteConfigJson` and merge onto bundled defaults (same shape as amz `siteConfig`).
 */
export function mergeAmzSiteConfigFromRaw(raw: unknown): AmzSiteConfig {
  let patch: unknown = {}
  if (typeof raw === 'string' && raw.trim()) {
    try {
      patch = JSON.parse(raw) as unknown
    } catch {
      patch = {}
    }
  } else if (isPlainObject(raw)) {
    patch = raw
  }
  const base = structuredClone(defaultAmzSiteConfig) as unknown as Record<string, unknown>
  if (isPlainObject(patch)) {
    deepMergeRecords(base, patch)
  }
  return base as AmzSiteConfig
}
