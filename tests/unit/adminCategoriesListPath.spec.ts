import { describe, expect, it } from 'vitest'
import { adminCategoriesListPath } from '@/components/adminBackgroundActivity/categoriesListPath'

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
