import { describe, expect, it } from 'vitest'

import {
  iconNodeToSvgXml,
  lucideBrandIconAbsoluteUrl,
  type IconNode,
  pascalIconNameToKebabFile,
  sanitizePascalLucideIconName,
} from '@/utilities/lucideIconSvg'

describe('lucideIconSvg', () => {
  it('sanitizePascalLucideIconName rejects non PascalCase identifiers', () => {
    expect(sanitizePascalLucideIconName('ShoppingBag')).toBe('ShoppingBag')
    expect(sanitizePascalLucideIconName('bad-name')).toBeNull()
    expect(sanitizePascalLucideIconName('')).toBeNull()
    expect(sanitizePascalLucideIconName(' icon ')).toBeNull()
  })

  it('pascalIconNameToKebabFile', () => {
    expect(pascalIconNameToKebabFile('ShoppingBag')).toBe('shopping-bag')
    expect(pascalIconNameToKebabFile('Image')).toBe('image')
    expect(pascalIconNameToKebabFile('AlignHorizontalDistributeCenter')).toBe(
      'align-horizontal-distribute-center',
    )
  })

  it('iconNodeToSvgXml strips React-only key attrs and escapes XML in attrs', () => {
    const node: IconNode = [['path', { d: 'M2 12h"', key: 'ignore-me' }]]
    const xml = iconNodeToSvgXml(node)
    expect(xml).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(xml).toContain('viewBox="0 0 24 24"')
    expect(xml).not.toContain('key=')
    expect(xml).toContain('&quot;')
  })

  it('lucideBrandIconAbsoluteUrl builds path on origin', () => {
    expect(lucideBrandIconAbsoluteUrl('')).toBeNull()
    expect(lucideBrandIconAbsoluteUrl('https://yarn.example/foo')).toBe(
      'https://yarn.example/api/public/site-brand-icon',
    )
    expect(lucideBrandIconAbsoluteUrl('yarn.example')).toBe(
      'https://yarn.example/api/public/site-brand-icon',
    )
  })
})
