import { z } from 'zod'
import { locales } from '@/i18n/config'
import { defaultAmzSiteConfig, type AmzSiteConfig } from './defaultSiteConfig'

export type ConfigIssue = { path: string; message: string }
const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor'])
const copy = z.string().max(40_000)
const href = z.string().max(2048).refine(value => {
  if (!value) return true
  if (/[\u0000-\u0020\\<>]/.test(value)) return false
  if (value.startsWith('/') && !value.startsWith('//')) return true
  if (value.startsWith('#')) return true
  try { return ['https:', 'http:', 'mailto:', 'tel:'].includes(new URL(value).protocol) }
  catch { return false }
}, 'Expected an internal path or a supported URL')
const color = z.string().max(100).refine(value => {
  const m = /^oklch\(\s*(\d*\.?\d+)(%)?\s+(\d*\.?\d+)\s+(-?\d*\.?\d+)(?:deg)?\s*\)$/i.exec(value)
  if (!m) return false
  const lightness = Number(m[1]) / (m[2] ? 100 : 1)
  return lightness >= 0 && lightness <= 1 && Number(m[3]) <= 0.5 && Number.isFinite(Number(m[4]))
}, 'Expected an oklch(lightness chroma hue) color')
const font = z.string().trim().min(1).max(300).regex(/^[\p{L}\p{N}\s,'"_-]+$/u, 'Expected font family names, not CSS or HTML')
const localeKey = z.enum(locales)
const navLink = z.strictObject({ label: copy, href })

const schemaCache = new Map<string, z.ZodType>()
function nodeSchema(value: unknown, path: string, partial: boolean): z.ZodType {
  const key = String(partial) + ':' + path
  const cached = schemaCache.get(key)
  if (cached) return cached
  const schema = buildNodeSchema(value, path, partial)
  schemaCache.set(key, schema)
  return schema
}

/** Derive required structure from the bundled template, with explicit dynamic fields. */
function buildNodeSchema(value: unknown, path: string, partial: boolean): z.ZodType {
  if (path === 'navigation.mainByLocale') return z.partialRecord(localeKey, z.array(navLink).max(100))
  if (/^pages\.(products|reviews|guides)\.byLocale$/.test(path)) {
    return z.partialRecord(localeKey, z.strictObject({
      title: copy.optional(), description: copy.optional(),
      ...(path.includes('products') ? { indexNote: copy.optional() } : {}),
    }))
  }
  if (Array.isArray(value)) return z.array(nodeSchema(value[0], `${path}[]`, false)).max(500)
  if (value !== null && typeof value === 'object') {
    const fields: Record<string, z.ZodType> = {}
    for (const [key, child] of Object.entries(value)) {
      const schema = nodeSchema(child, path ? `${path}.${key}` : key, partial)
      fields[key] = partial ? schema.optional() : schema
    }
    if (path === 'homepage.categories.items[]') fields.coverImage = href.optional()
    return z.strictObject(fields)
  }
  if (path === 'brand.logo.type') return z.enum(['lucide', 'image', 'svg'])
  if (path.startsWith('theme.colors.')) return color
  if (path.startsWith('fonts.')) return font
  if (path.endsWith('.href') || path === 'seo.siteUrl' || path === 'brand.logo.imagePath') return href
  if (path === 'brand.logo.svgPath') return copy.regex(/^[MmLlHhVvCcSsQqTtAaZzEe\d\s.,+\-]*$/, 'Expected SVG path data')
  if (typeof value === 'string') return copy
  if (typeof value === 'boolean') return z.boolean()
  if (typeof value === 'number') return z.number().finite()
  return z.never()
}

export const amzConfigSchema = nodeSchema(defaultAmzSiteConfig, '', false) as z.ZodType<AmzSiteConfig>
export const amzConfigPatchSchema = nodeSchema(defaultAmzSiteConfig, '', true)

function checkKeys(value: unknown, path = ''): void {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key
    if (unsafeKeys.has(key)) throw new AmzConfigValidationError([{ path: childPath, message: 'Unsupported property' }])
    checkKeys(child, childPath)
  }
}

export class AmzConfigValidationError extends Error {
  readonly code = 'DESIGN_VALIDATION_FAILED'
  constructor(public readonly issues: ConfigIssue[]) {
    super(issues.map(i => `${i.path || 'config'}: ${i.message}`).join('; '))
    this.name = 'AmzConfigValidationError'
  }
}

export function validateAmzConfig<T>(schema: z.ZodType<T>, value: unknown): T {
  let serialized: string | undefined
  try { serialized = JSON.stringify(value) } catch {
    throw new AmzConfigValidationError([{ path: '', message: 'Expected JSON configuration' }])
  }
  if (serialized && serialized.length > 120_000) {
    throw new AmzConfigValidationError([{ path: '', message: 'Configuration exceeds 120,000 characters' }])
  }
  checkKeys(value)
  const result = schema.safeParse(value)
  if (!result.success) throw new AmzConfigValidationError(result.error.issues.map(i => ({
    path: i.path.map(String).join('.'), message: i.message,
  })))
  return result.data
}

/** Read legacy records without allowing one malformed branch to break the whole site. */
export function sanitizeAmzConfig(raw: unknown, onRepair?: (paths: string[]) => void): AmzSiteConfig {
  const repaired: string[] = []
  const repair = (base: unknown, candidate: unknown, path: string): unknown => {
    if (candidate === undefined) return structuredClone(base)
    const schema = nodeSchema(base, path, false)
    if (base && typeof base === 'object' && !Array.isArray(base) &&
        candidate && typeof candidate === 'object' && !Array.isArray(candidate) &&
        !path.endsWith('ByLocale') && !path.endsWith('byLocale')) {
      const input = candidate as Record<string, unknown>
      return Object.fromEntries(Object.entries(base).map(([key, child]) => [
        key, repair(child, Object.hasOwn(input, key) ? input[key] : undefined, path ? `${path}.${key}` : key),
      ]))
    }
    const parsed = schema.safeParse(candidate)
    if (!parsed.success) repaired.push(path || 'config')
    return parsed.success ? parsed.data : structuredClone(base)
  }
  const result = repair(defaultAmzSiteConfig, raw, '') as AmzSiteConfig
  if (repaired.length) onRepair?.(repaired)
  return result
}
