/** Build categories collection list URL from current admin pathname (preserves tenant / base prefix). */
export function adminCategoriesListPath(currentPathname: string): string {
  const idx = currentPathname.indexOf('/collections/')
  if (idx === -1) return '/admin/collections/categories'
  return `${currentPathname.slice(0, idx)}/collections/categories`
}
