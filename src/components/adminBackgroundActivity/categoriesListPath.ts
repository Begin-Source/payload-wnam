/** Build categories collection list URL from current admin pathname (preserves tenant / base prefix). */
export function adminCategoriesListPath(currentPathname: string): string {
  const idx = currentPathname.indexOf('/collections/')
  if (idx === -1) return '/admin/collections/categories'
  return `${currentPathname.slice(0, idx)}/collections/categories`
}

/** Build pages collection list URL from current admin pathname (preserves tenant / base prefix). */
export function adminPagesListPath(currentPathname: string): string {
  const idx = currentPathname.indexOf('/collections/')
  if (idx === -1) return '/admin/collections/pages'
  return `${currentPathname.slice(0, idx)}/collections/pages`
}

/** Build keywords collection list URL from current admin pathname (preserves tenant / base prefix). */
export function adminKeywordsListPath(currentPathname: string): string {
  const idx = currentPathname.indexOf('/collections/')
  if (idx === -1) return '/admin/collections/keywords'
  return `${currentPathname.slice(0, idx)}/collections/keywords`
}

/** Build workflow-jobs collection list URL from current admin pathname (preserves tenant / base prefix). */
export function adminWorkflowJobsListPath(currentPathname: string): string {
  const idx = currentPathname.indexOf('/collections/')
  if (idx === -1) return '/admin/collections/workflow-jobs'
  return `${currentPathname.slice(0, idx)}/collections/workflow-jobs`
}
