import { describe, expect, it } from 'vitest'
import { defaultAmzSiteConfig } from '@/site-layouts/amz-template-1/defaultSiteConfig'
import {
  amzConfigSchema, amzConfigPatchSchema, AmzConfigValidationError,
  sanitizeAmzConfig, validateAmzConfig,
} from '@/site-layouts/amz-template-1/configSchema'

describe('AMZ design configuration boundary', () => {
  it('accepts the bundled configuration and a nested copy patch', () => {
    expect(validateAmzConfig(amzConfigSchema, defaultAmzSiteConfig)).toEqual(defaultAmzSiteConfig)
    expect(validateAmzConfig(amzConfigPatchSchema, { brand: { name: 'Camera Reviews' } }))
      .toEqual({ brand: { name: 'Camera Reviews' } })
  })

  it.each([
    { footer: null },
    { footer: { resources: 'invalid' } },
    { navigation: { main: [{ label: 'Click', href: 'javascript:alert(1)' }] } },
    { navigation: { main: [{ label: 'Click', href: '//untrusted.example' }] } },
    { fonts: { sans: 'Arial; } body { display: none }' } },
    { theme: { colors: { light: { primary: 'red;}</style><script>alert(1)</script>' } } } },
    { unknownSetting: true },
    JSON.parse('{"__proto__":{"polluted":true}}'),
  ])('rejects malformed or unsafe writes: %j', patch => {
    expect(() => validateAmzConfig(amzConfigPatchSchema, patch)).toThrow(AmzConfigValidationError)
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('reports the field path to the caller', () => {
    try {
      validateAmzConfig(amzConfigPatchSchema, { footer: { resources: null } })
      throw new Error('Expected validation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(AmzConfigValidationError)
      expect((error as AmzConfigValidationError).issues[0].path).toBe('footer.resources')
    }
  })

  it('repairs legacy corruption without losing unrelated valid copy', () => {
    const result = sanitizeAmzConfig({ brand: { name: 'Existing Site' }, footer: null })
    expect(result.brand.name).toBe('Existing Site')
    expect(result.footer.resources).toEqual(defaultAmzSiteConfig.footer.resources)
    expect(validateAmzConfig(amzConfigSchema, result)).toEqual(result)
  })

  it('returns independent defaults on missing legacy values', () => {
    const result = sanitizeAmzConfig(undefined)
    result.brand.name = 'Changed'
    expect(defaultAmzSiteConfig.brand.name).not.toBe('Changed')
  })
})
