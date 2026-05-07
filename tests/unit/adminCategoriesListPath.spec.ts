import { describe, expect, it } from 'vitest'
import {
  adminCategoriesListPath,
  adminKeywordsListPath,
  adminPagesListPath,
} from '@/components/adminBackgroundActivity/categoriesListPath'

describe('adminCategoriesListPath', () => {
  it('uses /admin prefix when no collections', () => {
    expect(adminCategoriesListPath('/admin/dashboard')).toBe('/admin/collections/categories')
  })

  it('replaces collection segment with categories list', () => {
    expect(adminCategoriesListPath('/admin/collections/sites')).toBe('/admin/collections/categories')
  })

  it('preserves path prefix before collections', () => {
    expect(adminCategoriesListPath('/org/admin/collections/articles')).toBe(
      '/org/admin/collections/categories',
    )
  })
})

describe('adminPagesListPath', () => {
  it('uses /admin prefix when no collections', () => {
    expect(adminPagesListPath('/admin/dashboard')).toBe('/admin/collections/pages')
  })

  it('replaces collection segment with pages list', () => {
    expect(adminPagesListPath('/admin/collections/categories')).toBe('/admin/collections/pages')
  })

  it('preserves path prefix before collections', () => {
    expect(adminPagesListPath('/org/admin/collections/articles')).toBe('/org/admin/collections/pages')
  })
})

describe('adminKeywordsListPath', () => {
  it('uses /admin prefix when no collections', () => {
    expect(adminKeywordsListPath('/admin/dashboard')).toBe('/admin/collections/keywords')
  })

  it('replaces collection segment with keywords list', () => {
    expect(adminKeywordsListPath('/admin/collections/sites')).toBe('/admin/collections/keywords')
  })

  it('preserves path prefix before collections', () => {
    expect(adminKeywordsListPath('/org/admin/collections/articles')).toBe(
      '/org/admin/collections/keywords',
    )
  })
})
